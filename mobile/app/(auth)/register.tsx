import { useState } from "react";
import { Text, View } from "react-native";
import { messageFor, authAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, COLORS, Header, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { fontSize } from "@/lib/theme";

export default function Register() {
  const { signIn } = useAuth();
  const [form, setForm] = useState({ display_name: "", email: "", password: "", referral_code: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const tooShort = form.password.length > 0 && form.password.length < 8;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await authAPI.register({
        display_name: form.display_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        referral_code: form.referral_code.trim() || undefined,
      });
      await signIn(r);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header back title="Create your account" subtitle="Your card starts earning from the first swipe." />
      <Field label="Name" value={form.display_name} onChangeText={set("display_name")} placeholder="Alex Tan" />
      <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" placeholder="name@email.com" />
      <Field
        label="Password"
        value={form.password}
        onChangeText={set("password")}
        secureTextEntry
        placeholder="At least 8 characters"
        hint={tooShort ? "Use at least 8 characters." : undefined}
      />
      <Field label="Referral code" value={form.referral_code} onChangeText={set("referral_code")} autoCapitalize="characters" placeholder="Optional" hint="A valid code adds 2,500 sats to your balance." mono />
      <Button
        label="Create account"
        onPress={submit}
        loading={busy}
        disabled={!form.display_name || !form.email || form.password.length < 8}
        style={{ marginTop: 8 }}
      />
      {error ? (
        <Card style={{ marginTop: 20, borderColor: COLORS.dangerBorder }}>
          <Text style={{ color: COLORS.text, fontSize: fontSize.caption, lineHeight: 20 }}>{error}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
