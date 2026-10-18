import { useCallback, useState } from "react";
import { Alert, View, Text, Pressable } from "react-native";
import { Trash2 } from "@/components/icons";
import { miscAPI } from "@/lib/api";
import { usd } from "@/lib/format";
import type { PriceAlert } from "@/lib/types";
import { useAction, useApi } from "@/lib/useApi";
import { Button, Card, COLORS, Empty, ErrorNote, Header, InlineError, Loading, Num, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { MIN_TOUCH_TARGET, fontSize, iconSize } from "@/lib/theme";

export default function Alerts() {
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const state = useApi(
    useCallback(async () => {
      const [alerts, btc] = await Promise.all([miscAPI.alerts(), miscAPI.btcPrice()]);
      return { alerts, btc };
    }, []),
  );

  // Both used to be bare awaits in onPress: a failure was an unhandled
  // rejection and the screen simply did nothing.
  const create = useAction(async () => {
    await miscAPI.createAlert({ target_price: Number(price), direction });
    setPrice("");
    await state.reload();
  });
  const remove = useAction(async (id: number) => {
    await miscAPI.deleteAlert(id);
    await state.reload();
  });

  function confirmRemove(a: PriceAlert) {
    Alert.alert(
      "Delete this alert?",
      `You won't be notified when bitcoin goes ${a.direction} ${usd(a.target_price)}.`,
      [
        { text: "Keep", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void remove.run(a.id) },
      ],
    );
  }

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Price alerts" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const d = state.data;

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <Header back title="Price alerts" subtitle={`Bitcoin is ${usd(d.btc.price)} right now.`} />

      <Card style={{ marginBottom: 24 }}>
        <View
          style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Alert when bitcoin"
        >
          {(["above", "below"] as const).map((dir) => (
            <Pressable
              key={dir}
              onPress={() => setDirection(dir)}
              accessibilityRole="radio"
              accessibilityState={{ checked: direction === dir }}
              style={{
                flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", borderRadius: 8,
                borderWidth: 1, borderColor: direction === dir ? COLORS.primary : COLORS.border,
                backgroundColor: direction === dir ? COLORS.accentSurface : "transparent",
              }}
            >
              <Text style={{ color: direction === dir ? COLORS.primary : COLORS.muted, fontSize: fontSize.caption }}>
                Goes {dir}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field label="Target price in USD" value={price} onChangeText={setPrice} keyboardType="decimal-pad" mono placeholder="120000" />
        <Button
          label="Create alert"
          disabled={!Number(price)}
          loading={create.busy}
          onPress={() => void create.run()}
        />
        <InlineError message={create.error} />
      </Card>

      <InlineError message={remove.error} style={{ marginTop: 0, marginBottom: 12 }} />

      {d.alerts.length === 0 ? (
        <Empty title="No alerts set" body="You'll get a notification when bitcoin crosses your target." />
      ) : (
        <View style={{ backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
          {d.alerts.map((a: PriceAlert, i: number) => (
            <View
              key={a.id}
              style={{
                flexDirection: "row", alignItems: "center", padding: 14,
                borderBottomWidth: i === d.alerts.length - 1 ? 0 : 1, borderBottomColor: COLORS.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Num size={fontSize.body} color={a.is_triggered ? COLORS.muted : COLORS.text}>
                  {usd(a.target_price)}
                </Num>
                <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 }}>
                  Goes {a.direction}{a.is_triggered ? " · triggered" : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => confirmRemove(a)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Delete alert at ${usd(a.target_price)}`}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Trash2 size={iconSize.sm} color={COLORS.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
