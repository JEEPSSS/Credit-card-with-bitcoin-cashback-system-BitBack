import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { authAPI } from "@/lib/api";
import { Button, Card, COLORS, Header, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { fontSize } from "@/lib/theme";

/** Five-segment meter. Length is weighted twice because it dominates entropy. */
function strength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Excellent"];
  return { score, label: labels[score] };
}

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const s = strength(pw);
  const matches = confirm.length > 0 && pw === confirm;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await authAPI.resetPassword({ token: token!, new_password: pw });
      setDone(true);
    } catch (e: any) {
      setError(e.friendlyMessage);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Header title="Password updated" subtitle="Sign in with your new password." />
        <Button label="Go to sign in" onPress={() => router.replace("/(auth)/login")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header back title="Choose a new password" />
      <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry placeholder="At least 8 characters" />
      <View style={{ flexDirection: "row", gap: 4, marginTop: -8, marginBottom: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 2,
              backgroundColor: i < s.score ? (s.score <= 2 ? COLORS.danger : s.score <= 3 ? COLORS.primary : COLORS.success) : COLORS.border,
            }}
          />
        ))}
      </View>
      {pw.length > 0 && <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginBottom: 16 }}>{s.label}</Text>}
      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        placeholder="Type it again"
        hint={confirm.length > 0 && !matches ? "These don't match yet." : undefined}
      />
      <Button label="Update password" onPress={submit} loading={busy} disabled={!matches || pw.length < 8} />
      {error ? (
        <Card style={{ marginTop: 20, borderColor: COLORS.dangerBorder }}>
          <Text style={{ color: COLORS.text, fontSize: fontSize.caption }}>{error}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
