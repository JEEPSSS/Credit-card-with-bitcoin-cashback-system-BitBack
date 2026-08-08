import { useEffect, useState } from "react";
import { View, Text, Switch } from "react-native";
import { configAPI } from "@/lib/api";
import { sats } from "@/lib/format";
import { Button, Card, COLORS, Header, Loading, Screen } from "@/components/ui";
import { Field } from "@/components/Field";

export default function AutoWithdraw() {
  const [cfg, setCfg] = useState<any>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { configAPI.getAutoWithdraw().then(setCfg).catch(() => {}); }, []);
  if (!cfg) return <Screen><Loading /></Screen>;

  async function save() {
    setError(""); setSaved(false);
    try {
      const r = await configAPI.setAutoWithdraw({
        is_enabled: cfg.is_enabled,
        threshold_sats: Number(cfg.threshold_sats),
        destination_address: cfg.destination_address || null,
      });
      setCfg(r); setSaved(true);
    } catch (e: any) { setError(e.friendlyMessage); }
  }

  return (
    <Screen>
      <Header back title="Auto-withdraw" subtitle="Send your sats to your own wallet once the balance passes a threshold." />
      <Card style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" }}>Auto-withdraw</Text>
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
        onChangeText={(v) => setCfg({ ...cfg, threshold_sats: v.replace(/\D/g, "") })}
        keyboardType="number-pad"
        mono
        hint={`Currently ${sats(Number(cfg.threshold_sats) || 0)} sats`}
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
      <Button label="Save" onPress={save} />
      {error ? <Text style={{ color: COLORS.danger, fontSize: 13, marginTop: 12 }}>{error}</Text> : null}
      {saved ? <Text style={{ color: COLORS.success, fontSize: 13, marginTop: 12 }}>Saved</Text> : null}
    </Screen>
  );
}
