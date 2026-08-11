import { useCallback, useState } from "react";
import { View, Text, Switch } from "react-native";
import { configAPI } from "@/lib/api";
import { sats } from "@/lib/format";
import type { AutoWithdrawConfig } from "@/lib/types";
import { useAction, useApi } from "@/lib/useApi";
import { Button, Card, COLORS, ErrorNote, Header, Loading, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { font, fontSize } from "@/lib/theme";

export default function AutoWithdraw() {
  const [saved, setSaved] = useState(false);
  const state = useApi(useCallback(() => configAPI.getAutoWithdraw(), []));

  const save = useAction(async (draft: AutoWithdrawConfig) => {
    setSaved(false);
    state.setData(await configAPI.setAutoWithdraw({
      is_enabled: draft.is_enabled,
      threshold_sats: Number(draft.threshold_sats),
      destination_address: draft.destination_address || null,
    }));
    setSaved(true);
  });

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Auto-withdraw" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const cfg = state.data;
  const setCfg = (next: AutoWithdrawConfig) => {
    setSaved(false);
    state.setData(next);
  };
  const error = save.error;

  return (
    <Screen>
      <Header back title="Auto-withdraw" subtitle="Send your sats to your own wallet once the balance passes a threshold." />
      <Card style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium }}>Auto-withdraw</Text>
          <Switch
            value={cfg.is_enabled}
            onValueChange={(v) => setCfg({ ...cfg, is_enabled: v })}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            accessibilityLabel="Enable auto-withdraw"
          />
        </View>
      </Card>
      <Field
        label="Threshold in sats"
        value={String(cfg.threshold_sats)}
        onChangeText={(v) => setCfg({ ...cfg, threshold_sats: Number(v.replace(/\D/g, "")) || 0 })}
        keyboardType="number-pad"
        mono
        hint={`Currently ${sats(cfg.threshold_sats)} sats`}
      />
      <Field
        label="Destination address"
        value={cfg.destination_address ?? ""}
        onChangeText={(v) => setCfg({ ...cfg, destination_address: v })}
        autoCapitalize="none"
        mono
        placeholder="bc1q..."
        hint="This build records the address; it does not broadcast a transaction."
      />
      <Button label="Save" onPress={() => void save.run(cfg)} loading={save.busy} />
      {error ? <Text style={{ color: COLORS.danger, fontSize: fontSize.caption, marginTop: 12 }}>{error}</Text> : null}
      {saved ? <Text style={{ color: COLORS.success, fontSize: fontSize.caption, marginTop: 12 }}>Saved</Text> : null}
    </Screen>
  );
}
