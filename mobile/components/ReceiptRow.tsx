import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Icons from "lucide-react-native";

import { sats, titleCase } from "@/lib/format";
import { timeOfDay } from "@/lib/statement";
import {
  CATEGORY_ICON, COLORS, RISK_FLAG_THRESHOLD, categoryColor, font, fontSize, iconSize,
  radius, space,
} from "@/lib/theme";

/**
 * A transaction is a line on a statement, not a card. Rows share one hairline
 * rule and one right-aligned mono column so the sats figures form a readable
 * column down the screen. Cards-per-row would break that alignment and triple
 * the vertical space.
 *
 * The icon puck carries the category's colour at low opacity with the glyph at
 * full strength. Ten distinct hues at constant lightness let you find "all the
 * dining" by colour before reading a word — the reason banks colour-code
 * categories at all — while the low-opacity fill keeps the row quiet enough
 * that the sats figure still wins the eye.
 *
 * The timestamp is a time, not a relative age, because the date now lives in
 * the section header above it. Two rows both saying "2d ago" under a header
 * that already says the day was noise.
 */

const PUCK_SIZE = 36;
const PUCK_TINT_OPACITY = "22";   // 13% over the row, in 8-digit hex

function iconFor(category: string) {
  const key = (CATEGORY_ICON as Record<string, string>)[category] ?? "credit-card";
  const pascal = key.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  return (Icons as unknown as Record<string, Icons.LucideIcon>)[pascal] ?? Icons.CreditCard;
}

export const ReceiptRow = memo(function ReceiptRow({
  merchant, category, amountFiat, satsEarned, createdAt, riskScore, onPress, last,
}: {
  merchant: string; category: string; amountFiat: number; satsEarned: number;
  createdAt: string; riskScore?: number; onPress?: () => void; last?: boolean;
}) {
  const Icon = iconFor(category);
  const tint = categoryColor(category);
  const flagged = (riskScore ?? 0) >= RISK_FLAG_THRESHOLD;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={
        `${merchant}, ${titleCase(category)}, $${amountFiat.toFixed(2)}, ` +
        `earned ${sats(satsEarned)} sats${flagged ? ", flagged for review" : ""}`
      }
      style={({ pressed }) => [
        styles.row,
        { borderBottomWidth: last ? 0 : 1, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.puck, { backgroundColor: `${tint}${PUCK_TINT_OPACITY}` }]}>
        <Icon size={iconSize.md} color={tint} />
      </View>

      <View style={styles.body}>
        <View style={styles.merchantLine}>
          <Text numberOfLines={1} style={styles.merchant}>
            {merchant}
          </Text>
          {flagged && <Icons.ShieldAlert size={iconSize.xs} color={COLORS.danger} />}
        </View>
        <Text style={styles.meta}>
          {titleCase(category)} · {timeOfDay(createdAt)}
        </Text>
      </View>

      <View style={styles.figures}>
        <Text style={styles.earned}>+{sats(satsEarned)}</Text>
        <Text style={styles.spent}>${amountFiat.toFixed(2)}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md + 2,
    borderBottomColor: COLORS.hairline,
  },
  puck: {
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.md,
  },
  body: { flex: 1, minWidth: 0 },
  merchantLine: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  merchant: {
    color: COLORS.text,
    fontSize: fontSize.body,
    fontFamily: font.medium,
    flexShrink: 1,
  },
  meta: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 },
  figures: { alignItems: "flex-end" },
  earned: {
    color: COLORS.primary,
    fontSize: fontSize.caption,
    fontFamily: font.mono,
    fontVariant: ["tabular-nums"],
  },
  spent: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    fontFamily: font.mono,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
});
