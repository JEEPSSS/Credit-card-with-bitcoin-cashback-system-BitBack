import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowUpRight, Bell, Flame, Sparkles, TrendingDown, TrendingUp } from "lucide-react-native";

import { aiAPI, miscAPI, rewardsAPI, transactionAPI, walletAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { sats, usd } from "@/lib/format";
import { COLORS, font, fontSize, iconSize, radius, space } from "@/lib/theme";
import type { Transaction } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Odometer } from "@/components/Odometer";
import { ReceiptRow } from "@/components/ReceiptRow";
import { Async, Button, Card, Divider, Label, Num, Screen } from "@/components/ui";

const RECENT_COUNT = 4;

export default function Home() {
  const { user } = useAuth();

  const state = useApi(
    useCallback(async () => {
      const [wallet, price, summary, txs, forecast, notifs] = await Promise.all([
        walletAPI.balance(),
        miscAPI.btcPrice(),
        rewardsAPI.summary(),
        transactionAPI.list(1),
        aiAPI.forecast(),
        miscAPI.notifications(),
      ]);
      return {
        wallet, price, summary, forecast,
        txs: txs.items.slice(0, RECENT_COUNT),
        unread: notifs.unread_count,
      };
    }, []),
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name}>{user?.display_name ?? "there"}</Text>
        </View>
        <NotificationBell unread={state.data?.unread ?? 0} />
      </View>

      <Async state={state}>
        {({ wallet, price, summary, txs, forecast }) => {
          const up = price.change_24h >= 0;
          return (
            <>
              {/* The balance is the thesis of the screen: one bold element,
                  everything else quiet. */}
              <Label>Your balance</Label>
              <View style={{ marginTop: space.sm + 2 }}>
                <Odometer value={wallet.balance_sats} fontSize={fontSize.display} suffix="sats" />
              </View>
              <Text style={styles.balanceUsd}>{usd(wallet.balance_usd)}</Text>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>BTC</Text>
                <Num size={fontSize.caption}>{usd(price.price)}</Num>
                {up ? (
                  <TrendingUp size={iconSize.xs} color={COLORS.success} />
                ) : (
                  <TrendingDown size={iconSize.xs} color={COLORS.danger} />
                )}
                <Num size={fontSize.caption} color={up ? COLORS.success : COLORS.danger}>
                  {up ? "+" : ""}{price.change_24h.toFixed(2)}%
                </Num>
              </View>

              <View style={styles.actions}>
                <Button
                  label="New transaction"
                  onPress={() => router.push("/(tabs)/simulate")}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Wallet"
                  variant="ghost"
                  onPress={() => router.push("/(tabs)/wallet")}
                  style={{ flex: 1 }}
                />
              </View>

              <View style={styles.stats}>
                <Stat
                  label="Streak"
                  value={`${summary.streak.current}`}
                  unit="days"
                  icon={<Flame size={iconSize.xs} color={COLORS.primary} />}
                />
                <Stat label="Level" value={summary.level.name} unit={`${summary.level.multiplier}x`} />
                <Stat
                  label="Badges"
                  value={`${summary.badges.earned_count}`}
                  unit={`of ${summary.badges.total_count}`}
                />
              </View>

              <Card onPress={() => router.push("/ai-insights")} style={{ marginBottom: space.lg }}>
                <View style={styles.cardHead}>
                  <View style={styles.cardHeadLeft}>
                    <Sparkles size={iconSize.sm} color={COLORS.primary} />
                    <Text style={styles.cardTitle}>AI insights</Text>
                  </View>
                  <ArrowUpRight size={iconSize.sm} color={COLORS.muted} />
                </View>
                <Text style={styles.cardBody}>
                  {forecast.has_enough_data
                    ? `Projected ${sats(forecast.predicted_sats_30d)} sats over the next 30 days, trending ${forecast.trend_direction}.`
                    : forecast.message}
                </Text>
              </Card>

              {summary.active_boost && (
                <Card tone="accent" style={{ marginBottom: space.lg }}>
                  <View style={styles.cardHeadLeft}>
                    <Flame size={iconSize.sm} color={COLORS.primary} />
                    <Text style={styles.cardTitle}>{summary.active_boost.category} boost active</Text>
                  </View>
                  <Text style={styles.cardBody}>
                    Earning {summary.active_boost.multiplier}x in this category.
                  </Text>
                </Card>
              )}

              <View style={styles.sectionHead}>
                <Label>Recent activity</Label>
                <Pressable onPress={() => router.push("/history")} hitSlop={10}>
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              </View>
              <Divider />
              {txs.length === 0 ? (
                <Text style={styles.emptyLine}>Your first transaction will appear here.</Text>
              ) : (
                txs.map((t, i) => (
                  <ReceiptRow
                    key={t.id}
                    {...toRow(t)}
                    last={i === txs.length - 1}
                    onPress={() => router.push("/history")}
                  />
                ))
              )}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function NotificationBell({ unread }: { unread: number }) {
  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      style={styles.bell}
    >
      <Bell size={iconSize.lg} color={COLORS.text} />
      {unread > 0 && <View style={styles.bellDot} />}
    </Pressable>
  );
}

export const toRow = (t: Transaction) => ({
  merchant: t.merchant,
  category: t.category,
  amountFiat: t.amount_fiat,
  satsEarned: t.sats_earned,
  createdAt: t.created_at,
});

function Stat({
  label, value, unit, icon,
}: {
  label: string; value: string; unit?: string; icon?: React.ReactNode;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statHead}>
        {icon}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  greeting: { color: COLORS.muted, fontSize: fontSize.caption },
  name: { color: COLORS.text, fontSize: fontSize.heading, fontFamily: font.medium, marginTop: 2 },
  bell: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  balanceUsd: {
    color: COLORS.muted,
    fontSize: fontSize.body,
    marginTop: space.xs + 2,
    fontFamily: font.mono,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    marginTop: space.lg,
    marginBottom: space.xl,
  },
  priceLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  actions: { flexDirection: "row", gap: space.sm + 2, marginBottom: space.xl },
  stats: { flexDirection: "row", gap: space.sm + 2, marginBottom: space.xl },
  stat: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: space.md,
  },
  statHead: { flexDirection: "row", alignItems: "center", gap: space.xs + 1 },
  statLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  statValue: {
    color: COLORS.text,
    fontSize: fontSize.body,
    fontFamily: font.medium,
    marginTop: space.xs + 2,
  },
  statUnit: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 1 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardHeadLeft: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardTitle: { color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium },
  cardBody: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: space.sm, lineHeight: 19 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  seeAll: { color: COLORS.primary, fontSize: fontSize.caption },
  emptyLine: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    paddingVertical: space.xl,
    textAlign: "center",
  },
});
