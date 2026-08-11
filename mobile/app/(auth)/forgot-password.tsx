import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { authAPI } from "@/lib/api";
import { Button, Card, COLORS, Header, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { fontSize } from "@/lib/theme";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const r = await authAPI.forgotPassword(email.trim().toLowerCase());
      setSent(true);
      setToken(r.reset_token ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header back title="Reset your password" subtitle="Enter the email on your account." />
      {!sent ? (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@email.com" />
          <Button label="Send reset link" onPress={submit} loading={busy} disabled={!email} />
        </>
      ) : (
        <Card>
          <Text style={{ color: COLORS.text, fontSize: fontSize.body, lineHeight: 22 }}>
            If that email has an account, a reset link is on its way.
          </Text>
          {token && (
            <>
              <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 12, lineHeight: 19 }}>
                There is no mail server in this build, so the token is returned directly for the demo.
              </Text>
              <Button
                label="Continue to reset"
                onPress={() => router.push({ pathname: "/(auth)/reset-password", params: { token } })}
                style={{ marginTop: 16 }}
              />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
