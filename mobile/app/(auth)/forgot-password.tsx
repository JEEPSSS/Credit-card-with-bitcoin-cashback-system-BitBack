import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { authAPI, messageFor } from "@/lib/api";
import { Button, Card, COLORS, Header, InlineError, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { fontSize } from "@/lib/theme";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await authAPI.forgotPassword(email.trim().toLowerCase());
      setSent(r.message);
      setToken(r.reset_token ?? null);
    } catch (e) {
      // Without this a failed request did nothing at all: no message, no change.
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header back title="Reset your password" subtitle="Enter the email on your account." />
      {!sent ? (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="name@email.com"
          />
          <Button label="Send reset link" onPress={submit} loading={busy} disabled={!email} />
          <InlineError message={error} />
        </>
      ) : (
        <Card>
          <Text style={{ color: COLORS.text, fontSize: fontSize.body, lineHeight: 22 }}>
            {sent}
          </Text>
          {token && (
            <>
              <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 12, lineHeight: 19 }}>
                This is a demo server, so the reset token is shown here directly.
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
