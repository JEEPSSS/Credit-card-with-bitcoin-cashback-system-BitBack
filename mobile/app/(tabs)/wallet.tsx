import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Area, CartesianChart, Line } from "victory-native";

import { miscAPI, walletAPI } from "@/lib/api";
import { relativeTime, sats, titleCase, usd } from "@/lib/format";
import { COLORS, MIN_CONTROL_HEIGHT, font, fontSize, radius, space } from "@/lib/theme";
import { useApi } from "@/lib/useApi";
import { ChartSkeleton } from "@/components/Skeleton";
import { Odometer } from "@/components/Odometer";
import { Async, Card, Divider, Header, Label, Num, Screen } from "@/components/ui";

const PERIODS = ["7d", "30d", "90d", "all"] as const;
type Period = (typeof PERIODS)[number];

const CHART_HEIGHT = 180;
const CHART_FILL = "rgba(247,147,26,0.18)";
const CHART_ANIMATION = { type: "timing", duration: 350 } as const;

export default function WalletScreen() {
  const [period, setPeriod] = useState<Period>("30d");

  const state = useApi(
    useCallback(async () => {
      const [balance, growth, ledger, price] = await Promise.all([
        walletAPI.balance(),
        walletAPI.growth(period),
        walletAPI.transactions(),
        miscAPI.btcPrice(),
      ]);
      return { balance, growth, ledger, price };
    }, [period]),
    [period],
  );

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <Header title="Wallet" />

      <Async state={state} skeleton={<ChartSkeleton />}>
        {({ balance, growth, ledger }) => {
          const points = growth.points.map((p, i) => ({ x: i, y: p.sats }));
          return (
            <>
              <Label>Total stacked</Label>
              <View style={{ marginTop: space.sm + 2 }}>
                <Odometer value={balance.balance_sats} fontSize={fontSize.display} suffix="sats" />
              </View>
              <Text style={styles.subBalance}>
                {usd(balance.balance_usd)} · {balance.balance_btc.toFixed(8)} BTC
              </Text>

              <View style={styles.periods}>
                {PERIODS.map((p) => {
                  const active = period === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPeriod(p)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.period,
                        {
                          backgroundColor: active ? COLORS.elevated : "transparent",
                          borderColor: active ? COLORS.border : "transparent",
                        },
                      ]}
                    >
                      <Text style={{ color: active ? COLORS.text : COLORS.muted, fontSize: fontSize.caption }}>
                        {p.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Card style={{ padding: space.md }}>
                <View style={{ height: CHART_HEIGHT }}>
                  {points.length > 1 && (
                    <CartesianChart data={points} xKey="x" yKeys={["y"]}>
                      {({ points: cp, chartBounds }) => (
                        <>
                          <Area
                            points={cp.y}
                            y0={chartBounds.bottom}
                            color={CHART_FILL}
                            animate={CHART_ANIMATION}
                          />
                          <Line
                            points={cp.y}
                            color={COLORS.primary}
                            strokeWidth={2}
                            animate={CHART_ANIMATION}
                          />
                        </>
                      )}
                    </CartesianChart>
                  )}
                </View>
                <Text style={styles.chartCaption}>
                  {growth.growth_sats >= 0 ? "+" : ""}{sats(growth.growth_sats)} sats over this period
                </Text>
              </Card>

              <View style={styles.ledgerHead}>
                <Label>Ledger</Label>
              </View>
              <Divider />
              {ledger.map((entry, i) => (
                <View
                  key={entry.id}
                  style={[
                    styles.ledgerRow,
                    { borderBottomWidth: i === ledger.length - 1 ? 0 : 1 },
                  ]}
                >
                  <View>
                    <Text style={styles.ledgerType}>
                      {titleCase(entry.type.replace(/_/g, " "))}
                    </Text>
                    <Text style={styles.ledgerTime}>{relativeTime(entry.created_at)}</Text>
                  </View>
                  <Num
                    size={fontSize.caption}
                    color={entry.amount_sats >= 0 ? COLORS.primary : COLORS.muted}
                  >
                    {entry.amount_sats >= 0 ? "+" : ""}{sats(entry.amount_sats)}
                  </Num>
                </View>
              ))}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subBalance: {
    color: COLORS.muted,
    fontSize: fontSize.body,
    marginTop: space.xs + 2,
    fontFamily: font.mono,
  },
  periods: {
    flexDirection: "row",
    gap: space.xs + 2,
    marginTop: space.xl,
    marginBottom: space.lg,
  },
  period: {
    flex: 1,
    minHeight: MIN_CONTROL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
  },
  chartCaption: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: space.sm },
  ledgerHead: { marginTop: space.xl + space.xs, marginBottom: space.xs },
  ledgerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md + 2,
    borderBottomColor: COLORS.border,
  },
  ledgerType: { color: COLORS.text, fontSize: fontSize.caption },
  ledgerTime: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 },
});
