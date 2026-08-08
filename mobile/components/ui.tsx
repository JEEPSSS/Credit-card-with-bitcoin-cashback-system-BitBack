import { ReactNode } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, Text, View, ViewStyle, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { MIN_TOUCH_TARGET } from "@/lib/theme";

export const COLORS = {
  bg: "#0A0A0B",
  card: "#141416",
  elevated: "#1C1C1F",
  border: "#2A2A2E",
  text: "#F2F1EE",
  muted: "#93939A",
  primary: "#F7931A",
  success: "#30A46C",
  danger: "#E5484D",
};

export function Screen({
  children, scroll = true, onRefresh, refreshing = false, padded = true,
}: {
  children: ReactNode; scroll?: boolean; onRefresh?: () => void;
  refreshing?: boolean; padded?: boolean;
}) {
  const inner = <View style={{ paddingHorizontal: padded ? 16 : 0, paddingBottom: 32 }}>{children}</View>;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.muted} />
            ) : undefined
          }
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, back }: { title: string; subtitle?: string; back?: boolean }) {
  return (
    <View style={{ paddingTop: 8, paddingBottom: 20 }}>
      {back && (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, justifyContent: "center", marginLeft: -12 }}
        >
          <ChevronLeft size={24} color={COLORS.text} />
        </Pressable>
      )}
      <Text style={{ color: COLORS.text, fontSize: 25, fontFamily: "Inter_500Medium" }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: COLORS.muted, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const body = (
    <View
      style={[
        { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 16 },
        style,
      ]}
    >
      {children}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Button({
  label, onPress, variant = "primary", disabled, loading, style,
}: {
  label: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const bg = variant === "primary" ? COLORS.primary : variant === "secondary" ? COLORS.elevated : "transparent";
  const fg = variant === "primary" ? "#1A1206" : COLORS.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: bg,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: COLORS.border,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 16, fontFamily: "Inter_500Medium" }}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Right-aligned mono numeral so columns of figures line up down the screen. */
export function Num({ children, size = 16, color = COLORS.text }: { children: ReactNode; size?: number; color?: string }) {
  return (
    <Text style={{ color, fontSize: size, fontFamily: "JetBrainsMono_500Medium", fontVariant: ["tabular-nums"] }}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: COLORS.muted, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" }}>
      {children}
    </Text>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: COLORS.border }} />;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: "center" }}>
      <Text style={{ color: COLORS.text, fontSize: 16, fontFamily: "Inter_500Medium" }}>{title}</Text>
      <Text style={{ color: COLORS.muted, fontSize: 14, marginTop: 6, textAlign: "center", lineHeight: 20 }}>
        {body}
      </Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 64, alignItems: "center" }}>
      <ActivityIndicator color={COLORS.muted} />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: "#4A2020" }}>
      <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 20 }}>{message}</Text>
      {onRetry && <Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 12 }} />}
    </Card>
  );
}
