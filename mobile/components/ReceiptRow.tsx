import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ShieldAlert, iconNamed } from "@/components/icons";

import { sats, titleCase } from "@/lib/format";
import { timeOfDay } from "@/lib/statement";
import type { Transaction } from "@/lib/types";
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
const PAPER_PUCK_OPACITY = "40";  // 25% over white: enough to tell the hues apart

/** A transaction as the props a row takes. */
export const toRow = (t: Transaction) => ({
  merchant: t.merchant,
  category: t.category,
  amountFiat: t.amount_fiat,
  satsEarned: t.sats_earned,
  createdAt: t.created_at,
});

const iconFor = (category: string) =>
  iconNamed((CATEGORY_ICON as Record<string, string>)[category]);

export const ReceiptRow = memo(function ReceiptRow({
  merchant, category, amountFiat, satsEarned, createdAt, riskScore, onPress, last, paper,
}: {
  merchant: string; category: string; amountFiat: number; satsEarned: number;
  createdAt: string; riskScore?: number; onPress?: () => void; last?: boolean;
  /** Drawn for the light sheet on Home: a white row with dark ink. */
  paper?: boolean;
}) {
  const Icon = iconFor(category);
  const tint = categoryColor(category);
  const flagged = (riskScore ?? 0) >= RISK_FLAG_THRESHOLD;

  if (paper) {
    // On the sheet each row is its own white slip rather than a ruled line: on
    // a light ground a hairline between rows all but disappears. The puck keeps
    // the category's colour as its fill, stronger than on the dark rows, and
    // the glyph goes to ink, because the category hues are too light to read
    // as a glyph on a pale tint (about 2.6:1).
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={
          `${merchant}, ${titleCase(category)}, $${amountFiat.toFixed(2)}, ` +
          `earned ${sats(satsEarned)} sats${flagged ? ", flagged for review" : ""}`
        }
        style={({ pressed }) => [styles.slip, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.puck, { backgroundColor: `${tint}${PAPER_PUCK_OPACITY}` }]}>
          <Icon size={iconSize.md} color={COLORS.ink} />
        </View>
        <View style={styles.body}>
          <View style={styles.merchantLine}>
            <Text numberOfLines={1} style={[styles.merchant, { color: COLORS.ink }]}>{merchant}</Text>
            {flagged && <ShieldAlert size={iconSize.xs} color={COLORS.danger} />}
          </View>
          <Text style={[styles.meta, { color: COLORS.inkMuted }]}>
            {titleCase(category)} · {timeOfDay(createdAt)}
          </Text>
        </View>
        <View style={styles.figures}>
          <Text style={[styles.earned, { color: COLORS.inkAccent }]}>+{sats(satsEarned)}</Text>
          <Text style={[styles.spent, { color: COLORS.inkMuted }]}>${amountFiat.toFixed(2)}</Text>
        </View>
      </Pressable>
    );
  }

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
          {flagged && <ShieldAlert size={iconSize.xs} color={COLORS.danger} />}
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
  slip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.paperCard,
    borderWidth: 1,
    borderColor: COLORS.paperEdge,
    borderRadius: radius.tile,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginTop: space.sm + 2,
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
