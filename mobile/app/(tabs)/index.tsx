import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ArrowUpRight, Bell, Flame, Sparkles, TrendingDown, TrendingUp } from "lucide-react-native";
import { aiAPI, analyticsAPI, miscAPI, rewardsAPI, transactionAPI, walletAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { sats, usd, pct } from "@/lib/format";
import { Odometer } from "@/components/Odometer";
import { ReceiptRow } from "@/components/ReceiptRow";
import { Button, Card, COLORS, Divider, Label, Loading, Num, Screen } from "@/components/ui";

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [wallet, price, summary, txs, forecast, notifs] = await Promise.all([
      walletAPI.balance(), miscAPI.btcPrice(), rewardsAPI.summary(),
      transactionAPI.list(1), aiAPI.forecast(), miscAPI.notifications(),
    ]);
    setData({ wallet, price, summary, txs: txs.items.slice(0, 4), forecast, unread: notifs.unread_count });
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  };

  if (!data) return <Screen><Loading /></Screen>;

  const { wallet, price, summary, txs, forecast, unread } = data;
  const up = price.change_24h >= 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, paddingBottom: 24 }}>
        <View>
          <Text style={{ color: COLORS.muted, fontSize: 13 }}>{greeting}</Text>
          <Text style={{ color: COLORS.text, fontSize: 20, fontFamily: "Inter_500Medium", marginTop: 2 }}>
            {user?.display_name ?? "there"}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/notifications")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Bell size={21} color={COLORS.text} />
          {unread > 0 && (
            <View style={{ position: "absolute", top: 9, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary }} />
          )}
        </Pressable>
      </View>

      {/* The balance is the thesis of the screen: one bold element, everything else quiet. */}
      <Label>Your balance</Label>
      <View style={{ marginTop: 10 }}>
        <Odometer value={wallet.balance_sats} fontSize={44} suffix="sats" />
      </View>
      <Text style={{ color: COLORS.muted, fontSize: 15, marginTop: 6, fontFamily: "JetBrainsMono_500Medium" }}>
        {usd(wallet.balance_usd)}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 24 }}>
        <Text style={{ color: COLORS.muted, fontSize: 13 }}>BTC</Text>
        <Num size={13}>{usd(price.price)}</Num>
        {up ? <TrendingUp size={13} color={COLORS.success} /> : <TrendingDown size={13} color={COLORS.danger} />}
        <Text style={{ color: up ? COLORS.success : COLORS.danger, fontSize: 13, fontFamily: "JetBrainsMono_500Medium" }}>
          {up ? "+" : ""}{price.change_24h.toFixed(2)}%
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
        <Button label="New transaction" onPress={() => router.push("/(tabs)/simulate")} style={{ flex: 1 }} />
        <Button label="Wallet" variant="ghost" onPress={() => router.push("/(tabs)/wallet")} style={{ flex: 1 }} />
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
        <Stat label="Streak" value={`${summary.streak.current}`} unit="days" icon={<Flame size={14} color={COLORS.primary} />} />
        <Stat label="Level" value={summary.level.name} unit={`${summary.level.multiplier}x`} />
        <Stat label="Badges" value={`${summary.badges.earned_count}`} unit={`of ${summary.badges.total_count}`} />
      </View>

      <Card onPress={() => router.push("/ai-insights")} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" }}>AI insights</Text>
          </View>
          <ArrowUpRight size={16} color={COLORS.muted} />
        </View>
        <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
          {forecast.has_enough_data
            ? `Projected ${sats(forecast.predicted_sats_30d)} sats over the next 30 days, trending ${forecast.trend_direction}.`
            : forecast.message}
        </Text>
      </Card>

      {summary.active_boost && (
        <Card style={{ marginBottom: 16, borderColor: "#4A3410" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Flame size={15} color={COLORS.primary} />
            <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
              {summary.active_boost.category} boost active
            </Text>
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
            Earning {summary.active_boost.multiplier}x in this category.
          </Text>
        </Card>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
        <Label>Recent activity</Label>
        <Pressable onPress={() => router.push("/history")} hitSlop={10}>
          <Text style={{ color: COLORS.primary, fontSize: 13 }}>See all</Text>
        </Pressable>
      </View>
      <Divider />
      {txs.length === 0 ? (
        <Text style={{ color: COLORS.muted, fontSize: 14, paddingVertical: 24, textAlign: "center" }}>
          Your first transaction will appear here.
        </Text>
      ) : (
        txs.map((t: any, i: number) => (
          <ReceiptRow key={t.id} {...toRow(t)} last={i === txs.length - 1} onPress={() => router.push("/history")} />
        ))
      )}
    </Screen>
  );
}

export const toRow = (t: any) => ({
  merchant: t.merchant, category: t.category, amountFiat: t.amount_fiat,
  satsEarned: t.sats_earned, createdAt: t.created_at,
});

function Stat({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon?: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {icon}
        <Text style={{ color: COLORS.muted, fontSize: 11 }}>{label}</Text>
      </View>
      <Text style={{ color: COLORS.text, fontSize: 17, fontFamily: "Inter_500Medium", marginTop: 6 }}>{value}</Text>
      {unit ? <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 1 }}>{unit}</Text> : null}
    </View>
  );
}
