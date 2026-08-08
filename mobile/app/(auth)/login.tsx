import { useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { Link } from "expo-router";
import { authAPI, securityAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, COLORS, Screen } from "@/components/ui";
import { Field } from "@/components/Field";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("demo@bitback.app");
  const [password, setPassword] = useState("demo12345");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await authAPI.login({ email: email.trim().toLowerCase(), password });
      if (r.requires_2fa) setChallenge(r.challenge_token);
      else await signIn(r.access_token, r.user);
    } catch (e: any) {
      setError(e.friendlyMessage);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError("");
    try {
      const r = await securityAPI.authenticate({ challenge_token: challenge!, code: code.trim() });
      await signIn(r.access_token, r.user);
    } catch (e: any) {
      setError(e.friendlyMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingTop: 56, paddingBottom: 40 }}>
          <Text style={{ color: COLORS.primary, fontSize: 44, fontFamily: "JetBrainsMono_500Medium" }}>₿</Text>
          <Text style={{ color: COLORS.text, fontSize: 25, fontFamily: "Inter_500Medium", marginTop: 12 }}>
            {challenge ? "Enter your code" : "Sign in to BitBack"}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 14, marginTop: 6, lineHeight: 20 }}>
            {challenge
              ? "Open your authenticator app and enter the six-digit code."
              : "Every purchase earns bitcoin instead of points."}
          </Text>
        </View>

        {challenge ? (
          <>
            <Field
              label="Six-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              mono
            />
            <Button label="Verify" onPress={submitCode} loading={busy} style={{ marginTop: 8 }} />
          </>
        ) : (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="name@email.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Your password"
            />
            <Button label="Sign in" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>
              <Link href="/(auth)/register" asChild>
                <Pressable hitSlop={12}>
                  <Text style={{ color: COLORS.primary, fontSize: 14 }}>Create an account</Text>
                </Pressable>
              </Link>
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable hitSlop={12}>
                  <Text style={{ color: COLORS.muted, fontSize: 14 }}>Forgot password</Text>
                </Pressable>
              </Link>
            </View>
          </>
        )}

        {error ? (
          <Card style={{ marginTop: 20, borderColor: "#4A2020" }}>
            <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 20 }}>{error}</Text>
          </Card>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
