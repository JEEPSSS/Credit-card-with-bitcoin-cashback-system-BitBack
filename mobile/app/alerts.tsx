import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { miscAPI } from "@/lib/api";
import { usd } from "@/lib/format";
import { Button, Card, COLORS, Empty, Header, Loading, Num, Screen } from "@/components/ui";
import { Field } from "@/components/Field";

export default function Alerts() {
  const [d, setD] = useState<any>(null);
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const load = useCallback(async () => {
    const [alerts, btc] = await Promise.all([miscAPI.alerts(), miscAPI.btcPrice()]);
    setD({ alerts, btc });
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));
  if (!d) return <Screen><Loading /></Screen>;

  return (
    <Screen onRefresh={load}>
      <Header back title="Price alerts" subtitle={`Bitcoin is ${usd(d.btc.price)} right now.`} />

      <Card style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {(["above", "below"] as const).map((dir) => (
            <Pressable
              key={dir}
              onPress={() => setDirection(dir)}
              accessibilityRole="radio"
              accessibilityState={{ selected: direction === dir }}
              style={{
                flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8,
                borderWidth: 1, borderColor: direction === dir ? COLORS.primary : COLORS.border,
                backgroundColor: direction === dir ? "#2A1D08" : "transparent",
              }}
            >
              <Text style={{ color: direction === dir ? COLORS.primary : COLORS.muted, fontSize: 14 }}>
                Goes {dir}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field label="Target price in USD" value={price} onChangeText={setPrice} keyboardType="decimal-pad" mono placeholder="120000" />
        <Button
          label="Create alert"
          disabled={!Number(price)}
          onPress={async () => { await miscAPI.createAlert({ target_price: Number(price), direction }); setPrice(""); load(); }}
        />
      </Card>

      {d.alerts.length === 0 ? (
        <Empty title="No alerts set" body="You'll get a notification when bitcoin crosses your target." />
      ) : (
        <View style={{ backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
          {d.alerts.map((a: any, i: number) => (
            <View
              key={a.id}
              style={{
                flexDirection: "row", alignItems: "center", padding: 14,
                borderBottomWidth: i === d.alerts.length - 1 ? 0 : 1, borderBottomColor: COLORS.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Num size={15} color={a.is_triggered ? COLORS.muted : COLORS.text}>
                  {usd(a.target_price)}
                </Num>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  Goes {a.direction}{a.is_triggered ? " · triggered" : ""}
                </Text>
              </View>
              <Pressable
                onPress={async () => { await miscAPI.deleteAlert(a.id); load(); }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Delete alert at ${usd(a.target_price)}`}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Trash2 size={16} color={COLORS.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
