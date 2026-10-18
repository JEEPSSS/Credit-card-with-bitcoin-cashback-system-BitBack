import { useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { Link } from "expo-router";
import { messageFor, authAPI, securityAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, COLORS, ErrorNote, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { MIN_TOUCH_TARGET, font, fontSize } from "@/lib/theme";

/**
 * The seeded demo account is filled in for local development only. In a
 * shipped build it put every tester who tapped "Sign in" into one shared
 * account, where any of them could turn on two-factor or delete it for the
 * rest. Its details stay in the README for a demo.
 */
const PREFILL = __DEV__
  ? { email: "demo@bitback.app", password: "demo12345" }
  : { email: "", password: "" };

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(PREFILL.email);
  const [password, setPassword] = useState(PREFILL.password);
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
      else await signIn(r);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError("");
    try {
      const r = await securityAPI.authenticate({ challenge_token: challenge!, code: code.trim() });
      await signIn(r);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingTop: 56, paddingBottom: 40 }}>
          <Text
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={{ color: COLORS.primary, fontSize: fontSize.display, fontFamily: font.mono }}
          >
            ₿
          </Text>
          <Text
            accessibilityRole="header"
            style={{ color: COLORS.text, fontSize: fontSize.title, fontFamily: font.medium, marginTop: 12 }}
          >
            {challenge ? "Enter your code" : "Sign in to BitBack"}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 6, lineHeight: 20 }}>
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
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              mono
            />
            <Button
              label="Verify"
              onPress={submitCode}
              loading={busy}
              disabled={code.trim().length !== 6}
              style={{ marginTop: 8 }}
            />
          </>
        ) : (
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
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              placeholder="Your password"
            />
            <Button
              label="Sign in"
              onPress={submit}
              loading={busy}
              disabled={!email.trim() || !password}
              style={{ marginTop: 8 }}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>
              <Link href="/(auth)/register" asChild>
                <Pressable accessibilityRole="link" hitSlop={12} style={linkStyle}>
                  <Text style={{ color: COLORS.primary, fontSize: fontSize.caption }}>Create an account</Text>
                </Pressable>
              </Link>
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable accessibilityRole="link" hitSlop={12} style={linkStyle}>
                  <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Forgot password</Text>
                </Pressable>
              </Link>
            </View>
          </>
        )}

        {error ? (
          <View style={{ marginTop: 20 }}>
            <ErrorNote message={error} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const linkStyle = { minHeight: MIN_TOUCH_TARGET, justifyContent: "center" } as const;
