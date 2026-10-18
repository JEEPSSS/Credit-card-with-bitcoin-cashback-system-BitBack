import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View, ViewStyle } from "react-native";
import { useFocusEffect } from "expo-router";

import { onWakingChange } from "@/lib/wake";
import { COLORS, fontSize, radius, space } from "@/lib/theme";

/**
 * Shown while the server is being woken (lib/wake.ts). Without it the first
 * screen after a quiet spell just spins for up to a minute with no reason
 * given; with it, the wait is explained.
 *
 * It sits in the page, at the top of each screen, and pushes the content down
 * while it shows. It used to float over the top of the app instead, where it
 * hid and took the taps meant for the back button and the notification bell
 * (WCAG 2.2 2.4.11, focus not obscured). Only the screen in front shows it, so
 * a screen reader announces it once.
 */
export function WakeBanner({ style }: { style?: ViewStyle }) {
  const [waking, setWaking] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => onWakingChange(setWaking), []);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  if (!waking || !focused) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        {
          flexDirection: "row", alignItems: "center", gap: space.sm,
          backgroundColor: COLORS.elevated, borderColor: COLORS.border, borderWidth: 1,
          borderRadius: radius.control, paddingVertical: space.sm, paddingHorizontal: space.md,
          marginHorizontal: space.lg, marginTop: space.sm,
        },
        style,
      ]}
    >
      <ActivityIndicator color={COLORS.primary} size="small" />
      <Text style={{ color: COLORS.text, fontSize: fontSize.caption, flex: 1 }}>
        Waking up the server. This can take up to a minute after a quiet spell.
      </Text>
    </View>
  );
}
