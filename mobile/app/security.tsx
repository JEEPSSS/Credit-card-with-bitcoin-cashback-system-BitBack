import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { securityAPI } from "@/lib/api";
import { Button, Card, COLORS, Header, Label, Loading, Screen } from "@/components/ui";
import { Field } from "@/components/Field";

export default function Security() {
  const [status, setStatus] = useState<any>(null);
  const [setup, setSetup] = useState<any>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { securityAPI.status().then(setStatus).catch(() => {}); }, []);
  if (!status) return <Screen><Loading /></Screen>;

  async function run(fn: () => Promise<any>) {
    setBusy(true); setError("");
    try { return await fn(); }
    catch (e: any) { setError(e.friendlyMessage); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <Header back title="Security" subtitle="Two-factor authentication adds a code from your authenticator app at sign-in." />

      <Card style={{ marginBottom: 20 }}>
        <Text style={{ color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" }}>
          Two-factor authentication
        </Text>
        <Text style={{ color: status.is_enabled ? COLORS.success : COLORS.muted, fontSize: 13, marginTop: 6 }}>
          {status.is_enabled ? "On" : "Off"}
        </Text>
      </Card>

      {!status.is_enabled && !setup && (
        <Button
          label="Set up two-factor"
          loading={busy}
          onPress={async () => { const r = await run(securityAPI.setup); if (r) setSetup(r); }}
        />
      )}

      {setup && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Label>Step 1 · add to your app</Label>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              Open Google Authenticator, Authy, or 1Password and add this key manually.
            </Text>
            <Text
              selectable
              style={{ color: COLORS.primary, fontSize: 15, fontFamily: "JetBrainsMono_500Medium", marginTop: 12, letterSpacing: 1 }}
            >
              {setup.secret}
            </Text>
            <Button label="Copy key" variant="secondary" style={{ marginTop: 14 }} onPress={() => Clipboard.setStringAsync(setup.secret)} />
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <Label>Step 2 · save your backup codes</Label>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              Each code works once if you lose access to your authenticator.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {setup.backup_codes.map((c: string) => (
                <Text key={c} style={{ color: COLORS.text, fontSize: 13, fontFamily: "JetBrainsMono_500Medium", width: "46%" }}>
                  {c}
                </Text>
              ))}
            </View>
          </Card>

          <Field label="Step 3 · enter the six-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} mono placeholder="000000" />
          <Button
            label="Turn on two-factor"
            loading={busy}
            disabled={code.length !== 6}
            onPress={async () => {
              const r = await run(() => securityAPI.verify(code));
              if (r) { setStatus({ is_enabled: true }); setSetup(null); setCode(""); }
            }}
          />
        </>
      )}

      {status.is_enabled && (
        <>
          <Field label="Enter a code to turn it off" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} mono placeholder="000000" />
          <Button
            label="Turn off two-factor"
            variant="ghost"
            loading={busy}
            disabled={code.length !== 6}
            onPress={async () => {
              const r = await run(() => securityAPI.disable(code));
              if (r) { setStatus({ is_enabled: false }); setCode(""); }
            }}
          />
        </>
      )}

      {error ? <Text style={{ color: COLORS.danger, fontSize: 13, marginTop: 16 }}>{error}</Text> : null}
    </Screen>
  );
}
