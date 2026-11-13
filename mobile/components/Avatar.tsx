import { StyleSheet, Text, View } from "react-native";

import { COLORS, font, fontSize } from "@/lib/theme";

/** Up to two initials from a display name: "Demo User" is "DU", "sanjeev" is "S". */
export function initials(name: string | undefined | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * The account, as a disc of initials. There are no profile photos in the app,
 * so this is the nearest thing to a face, and it is what tells a screen whose
 * account it is showing before any text is read. Decorative to a screen
 * reader: the name is always printed beside it.
 */
export function Avatar({ name, size = 44 }: { name: string | undefined | null; size?: number }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text maxFontSizeMultiplier={1.2} style={[styles.text, { fontSize: size >= 52 ? fontSize.body + 1 : fontSize.caption + 2 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  text: { color: COLORS.bright, fontFamily: font.medium },
});
