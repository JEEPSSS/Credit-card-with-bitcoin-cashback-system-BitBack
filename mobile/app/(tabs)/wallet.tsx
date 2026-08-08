import { useCallback, useState } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { CartesianChart, Area, Line } from "victory-native";
import { walletAPI, miscAPI } from "@/lib/api";
import { sats, usd, relativeTime, titleCase } from "@/lib/format";
import { Odometer } from "@/components/Odometer";
import { Card, COLORS, Divider, Header, Label, Loading, Num, Screen } from "@/components/ui";

const PERIODS = ["7d", "30d", "90d", "all"] as const;

export default function WalletScreen() {
  const [period, setPeriod] = useState<string>("30d");
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: string) => {
    const [balance, growth, ledger, price] = await Promise.all([
      walletAPI.balance(), walletAPI.growth(p), walletAPI.transactions(), miscAPI.btcPrice(),
    ]);
    setData({ balance, growth, ledger, price });
  }, []);

  useFocusEffect(useCallback(() => { load(period).catch(() => {}); }, [load, period]));

  if (!data) return <Screen><Loading /></Screen>;

  // Explicitly typed: `data` is `any`, so without this the array widens to
  // `any[]` and CartesianChart's xKey/yKeys generics resolve to `never`.
  const points: { x: number; y: number }[] = data.growth.points.map(
    (p: any, i: number) => ({ x: i, y: p.sats as number })
  );
  const change = data.growth.growth_sats;

  return (
    <Screen
      onRefresh={async () => { setRefreshing(true); await load(period).catch(() => {}); setRefreshing(false); }}
      refreshing={refreshing}
    >
      <Header title="Wallet" />

      <Label>Total stacked</Label>
      <View style={{ marginTop: 10 }}>
        <Odometer value={data.balance.balance_sats} fontSize={40} suffix="sats" />
      </View>
      <Text style={{ color: COLORS.muted, fontSize: 15, marginTop: 6, fontFamily: "JetBrainsMono_500Medium" }}>
        {usd(data.balance.balance_usd)} · {data.balance.balance_btc.toFixed(8)} BTC
      </Text>

      <View style={{ flexDirection: "row", gap: 6, marginTop: 24, marginBottom: 16 }}>
        {PERIODS.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p }}
            style={{
              flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 8,
              backgroundColor: period === p ? COLORS.elevated : "transparent",
              borderWidth: 1, borderColor: period === p ? COLORS.border : "transparent",
            }}
          >
            <Text style={{ color: period === p ? COLORS.text : COLORS.muted, fontSize: 13 }}>{p.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <Card style={{ padding: 12 }}>
        <View style={{ height: 180 }}>
          {points.length > 1 && (
            <CartesianChart data={points} xKey="x" yKeys={["y"]}>
              {({ points: cp, chartBounds }) => (
                <>
                  <Area
                    points={cp.y}
                    y0={chartBounds.bottom}
                    color="rgba(247,147,26,0.18)"
                    animate={{ type: "timing", duration: 350 }}
                  />
                  <Line points={cp.y} color={COLORS.primary} strokeWidth={2} animate={{ type: "timing", duration: 350 }} />
                </>
              )}
            </CartesianChart>
          )}
        </View>
        <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>
          {change >= 0 ? "+" : ""}{sats(change)} sats over this period
        </Text>
      </Card>

      <View style={{ marginTop: 28, marginBottom: 4 }}>
        <Label>Ledger</Label>
      </View>
      <Divider />
      {data.ledger.map((e: any, i: number) => (
        <View
          key={e.id}
          style={{
            flexDirection: "row", justifyContent: "space-between", alignItems: "center",
            paddingVertical: 14, borderBottomWidth: i === data.ledger.length - 1 ? 0 : 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <View>
            <Text style={{ color: COLORS.text, fontSize: 14 }}>{titleCase(e.type.replace(/_/g, " "))}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{relativeTime(e.created_at)}</Text>
          </View>
          <Num size={14} color={e.amount_sats >= 0 ? COLORS.primary : COLORS.muted}>
            {e.amount_sats >= 0 ? "+" : ""}{sats(e.amount_sats)}
          </Num>
        </View>
      ))}
    </Screen>
  );
}
