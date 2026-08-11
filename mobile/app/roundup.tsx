import { useCallback } from "react";
import { View, Text, Switch, Pressable } from "react-native";
import { configAPI } from "@/lib/api";
import type { RoundUpConfig } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Card, COLORS, ErrorNote, Header, Label, Loading, Screen } from "@/components/ui";
import { font, fontSize } from "@/lib/theme";

const OPTIONS = [
  { value: 1.0, label: "1x", note: "Spare change to the next dollar" },
  { value: 2.0, label: "2x", note: "Double the spare change" },
  { value: 3.0, label: "3x", note: "Triple the spare change" },
];

export default function RoundUp() {
  const state = useApi(useCallback(() => configAPI.getRoundup(), []));

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Round-up" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const cfg = state.data;

  /** Optimistic: flip the control immediately, roll back if the save fails. */
  const save = async (next: RoundUpConfig) => {
    const previous = cfg;
    state.setData(next);
    try {
      state.setData(await configAPI.setRoundup(next));
    } catch {
      state.setData(previous);
    }
  };

  return (
    <Screen>
      <Header back title="Round-up" subtitle="Round every purchase up to the next dollar and convert the difference to sats." />
      <Card style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium }}>Round-up</Text>
            <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 4, lineHeight: 19 }}>
              A $12.35 purchase adds 65 cents of bitcoin on top of the cashback.
            </Text>
          </View>
          <Switch
            value={cfg.is_enabled}
            onValueChange={(v) => save({ ...cfg, is_enabled: v })}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            accessibilityLabel="Enable round-up"
          />
        </View>
      </Card>

      {cfg.is_enabled && (
        <>
          <Label>Multiplier</Label>
          <View style={{ gap: 8, marginTop: 12 }}>
            {OPTIONS.map((o) => {
              const active = cfg.multiplier === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => save({ ...cfg, multiplier: o.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12,
                    backgroundColor: COLORS.card, borderWidth: 1,
                    borderColor: active ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Text style={{ color: active ? COLORS.primary : COLORS.text, fontSize: fontSize.body, fontFamily: font.mono, width: 40 }}>
                    {o.label}
                  </Text>
                  <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, flex: 1 }}>{o.note}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
