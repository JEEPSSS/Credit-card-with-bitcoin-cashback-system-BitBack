import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { onWakingChange } from "@/lib/wake";
import { COLORS, fontSize, space } from "@/lib/theme";

/**
 * Shown while the server is being woken (lib/wake.ts). Without it the first
 * screen after a quiet spell just spins for up to a minute with no reason
 * given; with it, the wait is explained.
 */
export function WakeBanner() {
  const [waking, setWaking] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => onWakingChange(setWaking), []);

  if (!waking) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute", left: space.md, right: space.md, top: insets.top + space.sm,
        flexDirection: "row", alignItems: "center", gap: space.sm,
        backgroundColor: COLORS.elevated, borderColor: COLORS.border, borderWidth: 1,
        borderRadius: 10, paddingVertical: space.sm, paddingHorizontal: space.md,
      }}
    >
      <ActivityIndicator color={COLORS.primary} size="small" />
      <Text style={{ color: COLORS.text, fontSize: fontSize.caption, flex: 1 }}>
        Waking up the server. This can take up to a minute after a quiet spell.
      </Text>
    </View>
  );
}
