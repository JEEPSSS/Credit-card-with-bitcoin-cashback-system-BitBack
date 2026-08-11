import { useCallback, useState } from "react";
import { View, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { securityAPI, messageFor } from "@/lib/api";
import type { TwoFactorSetup } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Button, Card, COLORS, ErrorNote, Header, Label, Loading, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { font, fontSize } from "@/lib/theme";

export default function Security() {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const state = useApi(useCallback(() => securityAPI.status(), []));

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Security" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const status = state.data;
  const setStatus = state.setData;

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(messageFor(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header back title="Security" subtitle="Two-factor authentication adds a code from your authenticator app at sign-in." />

      <Card style={{ marginBottom: 20 }}>
        <Text style={{ color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium }}>
          Two-factor authentication
        </Text>
        <Text style={{ color: status.is_enabled ? COLORS.success : COLORS.muted, fontSize: fontSize.caption, marginTop: 6 }}>
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
            <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8, lineHeight: 19 }}>
              Open Google Authenticator, Authy, or 1Password and add this key manually.
            </Text>
            <Text
              selectable
              style={{ color: COLORS.primary, fontSize: fontSize.body, fontFamily: font.mono, marginTop: 12, letterSpacing: 1 }}
            >
              {setup.secret}
            </Text>
            <Button label="Copy key" variant="secondary" style={{ marginTop: 14 }} onPress={() => Clipboard.setStringAsync(setup.secret)} />
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <Label>Step 2 · save your backup codes</Label>
            <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8, lineHeight: 19 }}>
              Each code works once if you lose access to your authenticator.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {setup.backup_codes.map((c: string) => (
                <Text key={c} style={{ color: COLORS.text, fontSize: fontSize.caption, fontFamily: font.mono, width: "46%" }}>
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

      {error ? <Text style={{ color: COLORS.danger, fontSize: fontSize.caption, marginTop: 16 }}>{error}</Text> : null}
    </Screen>
  );
}
