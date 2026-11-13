import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { analyticsAPI, walletAPI } from "@/lib/api";
import { pct, sats, titleCase, usd } from "@/lib/format";
import { timeOfDay } from "@/lib/statement";
import {
  COLORS, CONTROL_HIT_SLOP, MIN_CONTROL_HEIGHT, font, fontSize, iconSize, radius, space,
} from "@/lib/theme";
import type { LedgerEntry } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { refreshError } from "@/lib/screenState";
import {
  changeOnPrevious, compactSats, earnedBars, ledgerSections, niceCeiling,
} from "@/lib/wallet";
import type { EarnedBar, WalletPeriod } from "@/lib/wallet";
import { Coins, Send } from "@/components/icons";
import { ChartSkeleton } from "@/components/Skeleton";
import { Odometer } from "@/components/Odometer";
import { Async, Card, Header, Label, Num, Screen } from "@/components/ui";

/**
 * Wallet.
 *
 * The chart was a line of the running balance. A balance that only ever goes
 * up draws the same rising line for everyone, and the one thing it cannot show
 * is the thing a cashback card is about: how much each stretch of spending
 * paid. So the chart is now bars of sats earned per day, week or month, with
 * the latest bar solid and the rest held back, and tapping a bar reads it out.
 *
 * The bars are plain views, not a chart library. Five to twelve rounded
 * rectangles do not need a canvas, and as views each one is a button a screen
 * reader can land on and hear ("October 2026: 142,410 sats"), which a drawn
 * chart is not.
 *
 * Under it, what was spent in the period and what it earned as a rate, then
 * the ledger under day headings, the way History groups transactions.
 */

const PERIODS: WalletPeriod[] = ["7d", "30d", "90d", "all"];
const SATS_PER_BTC = 100_000_000;

const PLOT_HEIGHT = 150;
const AXIS_WIDTH = 38;
/** Unselected bars: the accent at about a third over the card, as one flat fill. */
const BAR_REST = "#5E3C10";

export default function WalletScreen() {
  const [period, setPeriod] = useState<WalletPeriod>("30d");

  const state = useApi(
    useCallback(async () => {
      const [balance, growth, ledger, spending] = await Promise.all([
        walletAPI.balance(),
        walletAPI.growth(period),
        walletAPI.transactions(),
        analyticsAPI.spending(period),
      ]);
      return { balance, growth, ledger, spending };
    }, [period]),
    [period],
  );

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing} refreshError={refreshError(state)}>
      <Header title="Wallet" />

      <Async state={state} skeleton={<ChartSkeleton />}>
        {({ balance, growth, ledger, spending }) => {
          const earnedUsd = (spending.total_sats / SATS_PER_BTC) * balance.btc_price;
          const rate = spending.total_spent > 0 ? earnedUsd / spending.total_spent : null;
          return (
            <>
              <Label>Total stacked</Label>
              <View style={{ marginTop: space.sm + 2 }}>
                <Odometer value={balance.balance_sats} fontSize={fontSize.display} suffix="sats" />
              </View>
              <Text style={styles.subBalance}>
                {usd(balance.balance_usd)} · {balance.balance_btc.toFixed(8)} BTC
              </Text>

              <Card style={styles.chartCard}>
                <EarnedChart
                  bars={earnedBars(growth.points, growth.growth_sats, period)}
                  total={growth.growth_sats}
                />
                <View style={styles.periods} accessibilityRole="tablist">
                  {PERIODS.map((p) => {
                    const active = period === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setPeriod(p)}
                        accessibilityRole="tab"
                        accessibilityLabel={PERIOD_NAME[p]}
                        accessibilityState={{ selected: active }}
                        hitSlop={CONTROL_HIT_SLOP}
                        style={[
                          styles.period,
                          active
                            ? { backgroundColor: COLORS.text, borderColor: COLORS.text }
                            : { borderColor: COLORS.border },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? COLORS.canvas : COLORS.muted,
                            fontSize: fontSize.caption,
                            fontFamily: active ? font.medium : font.regular,
                          }}
                        >
                          {p === "all" ? "All" : p.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>

              <View style={styles.tiles}>
                <View style={styles.tile}>
                  <Text style={styles.tileLabel}>Spent</Text>
                  <Num size={fontSize.body + 1}>{usd(spending.total_spent)}</Num>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileLabel}>Effective rate</Text>
                  <Num size={fontSize.body + 1}>{rate === null ? "–" : pct(rate, 1)}</Num>
                </View>
              </View>

              {ledgerSections(ledger).map((section) => (
                <View key={section.key} style={styles.section}>
                  <Label>{section.title}</Label>
                  {section.data.map((entry, i) => (
                    <LedgerRow key={entry.id} entry={entry} last={i === section.data.length - 1} />
                  ))}
                </View>
              ))}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

const PERIOD_NAME: Record<WalletPeriod, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "Last 12 months",
};

/**
 * Bars of sats earned. The newest bar is selected to begin with; tapping
 * another selects it, and the figure above the plot is always the selected
 * bar's, so the chart has one number to read at a time.
 */
function EarnedChart({ bars, total }: { bars: EarnedBar[]; total: number }) {
  const [picked, setPicked] = useState(bars.length - 1);
  // A new period brings a different set of bars; start again from the newest.
  const signature = bars.map((b) => b.key).join("|");
  useEffect(() => setPicked(bars.length - 1), [signature, bars.length]);

  const ceiling = useMemo(() => niceCeiling(Math.max(0, ...bars.map((b) => b.sats))), [bars]);
  const change = changeOnPrevious(bars);
  const selected = bars[Math.min(picked, bars.length - 1)];
  const up = (change?.change ?? 0) >= 0;

  if (bars.length === 0 || !selected) {
    return <Text style={styles.chartEmpty}>Nothing earned in this period yet.</Text>;
  }

  return (
    <>
      <View style={styles.chartHead}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.chartLabel}>Earned · {selected.name}</Text>
          <View style={styles.chartFigure}>
            <Num size={fontSize.title}>{sats(selected.sats)}</Num>
            <Text style={styles.chartUnit}>sats</Text>
          </View>
        </View>
        {change ? (
          <Num size={fontSize.caption} color={up ? COLORS.success : COLORS.danger}>
            {up ? "▲" : "▼"} {Math.abs(change.change * 100).toFixed(0)}% vs {change.against}
          </Num>
        ) : null}
      </View>

      <View style={styles.plot}>
        {[1, 0.5, 0].map((at) => (
          <View key={at} style={[styles.gridline, { bottom: LABEL_ROW + at * PLOT_HEIGHT }]}>
            <Text style={styles.axis}>{compactSats(ceiling * at)}</Text>
          </View>
        ))}
        <View style={styles.bars}>
          {bars.map((bar, i) => {
            const active = i === picked;
            const height = Math.max((Math.max(bar.sats, 0) / ceiling) * PLOT_HEIGHT, bar.sats > 0 ? 4 : 2);
            return (
              <Pressable
                key={bar.key}
                onPress={() => setPicked(i)}
                accessibilityRole="button"
                accessibilityLabel={`${bar.name}: ${sats(bar.sats)} sats`}
                accessibilityState={{ selected: active }}
                style={styles.barSlot}
              >
                <View
                  style={[
                    styles.bar,
                    { height, backgroundColor: active ? COLORS.primary : BAR_REST },
                  ]}
                />
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={[styles.barLabel, { color: active ? COLORS.text : COLORS.muted }]}
                >
                  {bar.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.chartCaption}>
        {total >= 0 ? "+" : ""}{sats(total)} sats over this period
      </Text>
    </>
  );
}

/** One ledger entry. Sats in are the accent; sats out are quiet. */
function LedgerRow({ entry, last }: { entry: LedgerEntry; last: boolean }) {
  const credit = entry.amount_sats >= 0;
  const Icon = credit ? Coins : Send;
  return (
    <View style={[styles.ledgerRow, { borderBottomWidth: last ? 0 : 1 }]}>
      <View style={[styles.puck, { backgroundColor: credit ? COLORS.accentSurface : COLORS.raised }]}>
        <Icon size={iconSize.md} color={credit ? COLORS.primary : COLORS.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.ledgerType}>{titleCase(entry.type.replace(/_/g, " "))}</Text>
        <Text style={styles.ledgerTime}>{timeOfDay(entry.created_at)}</Text>
      </View>
      <Num size={fontSize.caption} color={credit ? COLORS.primary : COLORS.muted}>
        {credit ? "+" : ""}{sats(entry.amount_sats)}
      </Num>
    </View>
  );
}

/** Room under the plot for the bar labels. */
const LABEL_ROW = 24;

const styles = StyleSheet.create({
  subBalance: {
    color: COLORS.muted,
    fontSize: fontSize.body,
    marginTop: space.xs + 2,
    fontFamily: font.mono,
  },
  chartCard: { marginTop: space.xl, padding: space.lg },
  chartHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    columnGap: space.md,
    rowGap: space.xs,
  },
  chartLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  chartFigure: { flexDirection: "row", alignItems: "baseline", gap: space.xs + 2, marginTop: space.xs },
  chartUnit: { color: COLORS.muted, fontSize: fontSize.caption },
  chartEmpty: { color: COLORS.muted, fontSize: fontSize.caption, paddingVertical: space["2xl"], textAlign: "center" },
  plot: { height: PLOT_HEIGHT + LABEL_ROW, marginTop: space.xl },
  gridline: {
    position: "absolute",
    left: AXIS_WIDTH,
    right: 0,
    height: 1,
    backgroundColor: COLORS.hairline,
  },
  axis: {
    position: "absolute",
    left: -AXIS_WIDTH,
    top: -8,
    width: AXIS_WIDTH - space.sm,
    color: COLORS.muted,
    fontSize: 11,
    fontFamily: font.mono,
  },
  bars: {
    position: "absolute",
    left: AXIS_WIDTH,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  // Each slot is the bar's whole column, so the touch target is the column's
  // full height and width however short the bar is.
  barSlot: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "62%", maxWidth: 34, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  barLabel: { height: LABEL_ROW, lineHeight: LABEL_ROW, fontSize: 11 },
  chartCaption: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: space.sm },
  periods: { flexDirection: "row", justifyContent: "flex-end", gap: space.xs + 2, marginTop: space.md + 2 },
  period: {
    minHeight: MIN_CONTROL_HEIGHT,
    minWidth: 46,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm + 2, marginTop: space.md },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: radius.card,
    padding: space.md + 2,
    gap: space.xs + 2,
  },
  tileLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  section: { marginTop: space.xl },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    borderBottomColor: COLORS.hairline,
  },
  puck: { width: 36, height: 36, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  ledgerType: { color: COLORS.text, fontSize: fontSize.body - 1 },
  ledgerTime: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 },
});
