import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { authAPI, messageFor } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, COLORS, Header, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { fontSize, space } from "@/lib/theme";

const DELETED = [
  "Your account, email and password",
  "Every simulated purchase, reward and risk score",
  "Your wallet balance, history and savings goals",
  "Streaks, badges, boosts, alerts and notifications",
  "Two-factor settings and referral links",
];

/**
 * Account deletion, required by App Store guideline 5.1.1(v).
 *
 * Two deliberate steps - the password, then a native confirmation - because
 * this is the only action in the app that cannot be undone. The confirmation
 * names the consequence rather than asking "Are you sure?".
 */
export default function DeleteAccount() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await authAPI.deleteAccount(password);
      await signOut();      // clears the stored token and returns to sign-in
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    Alert.alert(
      "Delete your account?",
      "Your account and all of its data will be removed now. This can't be undone.",
      [
        { text: "Keep my account", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void remove() },
      ],
    );
  }

  return (
    <Screen>
      <Header back title="Delete account" subtitle="This removes your account and everything stored with it." />

      <Card style={{ marginBottom: space.xl }}>
        {DELETED.map((line) => (
          <View key={line} style={{ flexDirection: "row", marginBottom: 8 }}>
            <Text style={{ color: COLORS.muted, fontSize: fontSize.body, width: 16 }}>·</Text>
            <Text style={{ color: COLORS.text, fontSize: fontSize.body, flex: 1, lineHeight: 22 }}>{line}</Text>
          </View>
        ))}
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8, lineHeight: 19 }}>
          Referral bonuses already paid to someone else stay with them. Anonymous survey answers
          were never linked to your account.
        </Text>
      </Card>

      <Field
        label="Enter your password to continue"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      <Button label="Delete my account" variant="danger" loading={busy} disabled={!password} onPress={confirm} />

      {error ? <Text style={{ color: COLORS.danger, fontSize: fontSize.caption, marginTop: 16 }}>{error}</Text> : null}
    </Screen>
  );
}
