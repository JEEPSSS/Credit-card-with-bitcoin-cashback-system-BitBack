import { ReactNode } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextStyle, View, ViewStyle, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft } from "@/components/icons";
import * as Haptics from "expo-haptics";

import { COLORS, MIN_TOUCH_TARGET, font, fontSize, iconSize, radius, space } from "@/lib/theme";
import type { AsyncState } from "@/lib/useApi";
import { WakeBanner } from "@/components/WakeBanner";

export { COLORS };

export function Screen({
  children, scroll = true, onRefresh, refreshing = false, padded = true, refreshError, onRetry,
}: {
  children: ReactNode; scroll?: boolean; onRefresh?: () => void;
  refreshing?: boolean; padded?: boolean;
  /** A failed reload over data still on screen; see lib/screenState.ts. */
  refreshError?: string | null; onRetry?: () => void;
}) {
  // Keyed on the system text size. Changing it while the app runs left text
  // laid out at the old size, clipped until the app was restarted (found on a
  // device); a new key makes the screen's content lay itself out again. Screen
  // state lives in the screen component above this, so nothing typed is lost.
  const { fontScale } = useWindowDimensions();
  const inner = (
    <View
      key={fontScale}
      style={{ paddingHorizontal: padded ? space.lg : 0, paddingBottom: space["2xl"] }}
    >
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <WakeBanner />
      <RefreshNote message={refreshError} onRetry={onRetry ?? onRefresh} />
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
    <View style={styles.header}>
      {back && (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.backButton}
        >
          <ChevronLeft size={iconSize.xl} color={COLORS.text} />
        </Pressable>
      )}
      <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({
  children, style, onPress, tone = "default",
}: {
  children: ReactNode; style?: ViewStyle; onPress?: () => void;
  tone?: "default" | "danger" | "accent";
}) {
  const borderColor =
    tone === "danger" ? COLORS.dangerBorder : tone === "accent" ? COLORS.accentBorder : COLORS.border;
  const body = <View style={[styles.card, { borderColor }, style]}>{children}</View>;
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Button({
  label, onPress, variant = "primary", disabled, loading, style,
}: {
  label: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  // `danger` is for the one irreversible action in the app. It uses the soft
  // danger fill rather than solid red so it reads as serious, not as an alarm.
  const bg =
    variant === "primary" ? COLORS.primary
    : variant === "secondary" ? COLORS.elevated
    : variant === "danger" ? COLORS.dangerSoft
    : "transparent";
  const fg =
    variant === "primary" ? COLORS.onPrimary : variant === "danger" ? COLORS.danger : COLORS.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderWidth: variant === "ghost" || variant === "danger" ? 1 : 0,
          borderColor: variant === "danger" ? COLORS.dangerEdge : COLORS.border,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Right-aligned mono numeral so columns of figures line up down the screen. */
export function Num({
  children, size = fontSize.body, color = COLORS.text,
}: {
  children: ReactNode; size?: number; color?: string;
}) {
  return <Text style={[styles.num, { fontSize: size, color }]}>{children}</Text>;
}

/** Section heading. Marked as a header so screen readers can jump between sections. */
export function Label({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.label}>{children}</Text>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={COLORS.muted} accessibilityLabel="Loading" />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card tone="danger">
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>
        {message}
      </Text>
      {onRetry && (
        <Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: space.md }} />
      )}
    </Card>
  );
}

/**
 * "Couldn't refresh" over figures that are still the last ones loaded. Shown
 * above the content rather than in place of it: the old data is still useful,
 * as long as the screen says it may be out of date.
 */
function RefreshNote({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.refreshNote}>
      <Text style={styles.refreshText}>Couldn&apos;t refresh, so this may be out of date. {message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={styles.refreshRetry}
        >
          <Text style={styles.refreshRetryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A failure shown next to the control that caused it. Announced when it
 * appears (WCAG 2.2 4.1.3, status messages): otherwise a screen reader user
 * presses a button and hears nothing at all when it fails.
 */
export function InlineError({ message, style }: { message?: string | null; style?: TextStyle }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.inlineError, style]}>
      {message}
    </Text>
  );
}

/**
 * Renders one of three states for a screen's data: still loading, failed with a
 * retry, or ready. Screens used to hold `if (!data) return <Loading />`, which
 * meant a failed request rendered a spinner forever.
 *
 * Pass a `skeleton` shaped like the content it stands in for. A spinner says
 * only that something is happening; a skeleton says what is arriving and where,
 * so nothing shifts when it lands. `Loading` remains the fallback for screens
 * whose shape is not worth describing.
 */
export function Async<T>({
  state, children, empty, skeleton,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
  skeleton?: ReactNode;
}) {
  if (state.error && state.data === null) {
    return <ErrorNote message={state.error} onRetry={state.reload} />;
  }
  if (state.loading && state.data === null) return <>{skeleton ?? <Loading />}</>;
  if (state.data === null) return <>{empty ?? null}</>;
  return <>{children(state.data)}</>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: space.sm, paddingBottom: space.xl },
  backButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    justifyContent: "center",
    marginLeft: -space.md,
  },
  headerTitle: { color: COLORS.text, fontSize: fontSize.title, fontFamily: font.medium },
  headerSubtitle: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    marginTop: space.xs,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.lg,
  },
  button: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderColor: COLORS.border,
  },
  buttonLabel: { fontSize: fontSize.body, fontFamily: font.medium },
  num: { fontFamily: font.mono, fontVariant: ["tabular-nums"] },
  label: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  empty: { paddingVertical: space["3xl"], alignItems: "center" },
  emptyTitle: { color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium },
  emptyBody: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    marginTop: space.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  loading: { paddingVertical: 64, alignItems: "center" },
  errorText: { color: COLORS.text, fontSize: fontSize.caption, lineHeight: 20 },
  refreshNote: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm,
    marginHorizontal: space.lg, marginTop: space.sm, paddingLeft: space.md,
    backgroundColor: COLORS.surface, borderColor: COLORS.dangerBorder, borderWidth: 1,
    borderRadius: radius.control,
  },
  refreshText: {
    color: COLORS.text, fontSize: fontSize.caption, lineHeight: 18,
    flex: 1, minWidth: 160, paddingVertical: space.sm,
  },
  refreshRetry: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: space.md },
  refreshRetryText: { color: COLORS.primary, fontSize: fontSize.caption, fontFamily: font.medium },
  inlineError: { color: COLORS.danger, fontSize: fontSize.caption, lineHeight: 20, marginTop: space.md },
});
