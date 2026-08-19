import { memo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, {
  Defs, LinearGradient, Path, Rect, Stop, G, Circle,
} from "react-native-svg";

import {
  CARD_ASPECT, CARD_CORNER_RATIO, COLORS, font, fontSize, radius, space, tierOf, tracking,
} from "@/lib/theme";

/**
 * The payment card.
 *
 * The product is a card, and until now the app never showed one — the home
 * screen opened on a number. Every competitor in this space (Fold, Gemini,
 * the Coinbase Card) leads with the card object, because it is the most
 * recognisable thing about the product and the thing a prospective user is
 * actually being sold.
 *
 * Three decisions keep this from looking like a coloured rectangle:
 *
 * 1. It is cut to ISO/IEC 7810 ID-1, the standard every real payment card in
 *    the world uses — 85.60 × 53.98 mm, and a 3.18 mm corner radius that
 *    scales with the card rather than being a fixed 12px. The proportion is
 *    what the eye recognises; get it wrong and no amount of finish helps.
 *
 * 2. The furniture sits where the standard puts it. The chip is on the left at
 *    roughly a third of the height, the contactless mark sits to its right, the
 *    number runs below on its own line in mono, and the holder's name is bottom
 *    left in caps. These positions are not arbitrary and a card with them wrong
 *    looks immediately fake.
 *
 * 3. The finish is one shallow diagonal sheen over a flat tier colour — the way
 *    light falls across a matte plastic card. Not a two-hue gradient, not a
 *    glow, not a blur panel. Those are the three things that make a UI card
 *    read as generated rather than designed.
 *
 * The tier finish is a real product mechanic, not decoration: it is keyed to
 * the reward level the user has actually reached, so the card visibly changes
 * as they earn. That gives the levelling system a payoff you can see.
 */

const PAN_MASK = "••••";

/** Deterministic last four, so a given account always shows the same card. */
function lastFour(seed: number): string {
  const n = ((seed * 7919 + 104729) % 9000) + 1000;
  return String(n);
}

/** Expiry three years out, stable per account. */
function expiry(seed: number): string {
  const month = ((seed * 13) % 12) + 1;
  const year = 28 + (seed % 3);
  return `${String(month).padStart(2, "0")}/${year}`;
}

function Chip({ size, tint }: { size: number; tint: string }) {
  // EMV contact plate: a rounded rect with the contact pads etched into it.
  const w = size;
  const h = size * 0.78;
  return (
    <Svg width={w} height={h} viewBox="0 0 44 34">
      <Rect x={0} y={0} width={44} height={34} rx={5} fill={tint} opacity={0.92} />
      <G stroke={COLORS.canvas} strokeWidth={1.4} opacity={0.55}>
        <Path d="M0 12 H14 M30 12 H44 M0 22 H14 M30 22 H44" />
        <Path d="M14 4 V30 M30 4 V30" />
        <Path d="M14 17 H30" />
      </G>
    </Svg>
  );
}

function Contactless({ size, tint }: { size: number; tint: string }) {
  // Four nested arcs, the EMV contactless symbol.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={tint} strokeWidth={1.8} fill="none" strokeLinecap="round" opacity={0.75}>
        <Path d="M8 6.5a8 8 0 0 1 0 11" />
        <Path d="M12 4.5a12 12 0 0 1 0 15" />
        <Path d="M16 2.5a16 16 0 0 1 0 19" />
        <Circle cx={5} cy={12} r={1.1} fill={tint} stroke="none" />
      </G>
    </Svg>
  );
}

export const PaymentCard = memo(function PaymentCard({
  levelKey, levelName, holder, seed, multiplier,
}: {
  levelKey: string;
  levelName: string;
  holder: string;
  seed: number;
  multiplier: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const width = screenWidth - space.lg * 2;
  const height = width / CARD_ASPECT;
  const corner = height * CARD_CORNER_RATIO;
  const tier = tierOf(levelKey);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${levelName} BitBack card, earning ${multiplier} times cashback`}
      style={[styles.card, { width, height, borderRadius: corner }]}
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* One shallow diagonal sheen. Light across matte plastic, nothing more. */}
          <LinearGradient id="face" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tier.face} stopOpacity="1" />
            <Stop offset="0.55" stopColor={tier.face} stopOpacity="1" />
            <Stop offset="1" stopColor={tier.edge} stopOpacity="0.18" />
          </LinearGradient>
          <LinearGradient id="sheen" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={tier.edge} stopOpacity="0" />
            <Stop offset="0.5" stopColor={tier.edge} stopOpacity="0.07" />
            <Stop offset="1" stopColor={tier.edge} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} rx={corner} fill="url(#face)" />
        <Rect width={width} height={height} rx={corner} fill="url(#sheen)" />
        <Rect
          x={0.75}
          y={0.75}
          width={width - 1.5}
          height={height - 1.5}
          rx={corner}
          fill="none"
          stroke={tier.edge}
          strokeOpacity={0.28}
          strokeWidth={1.5}
        />
      </Svg>

      <View style={styles.inner}>
        <View style={styles.topRow}>
          <Text style={[styles.wordmark, { color: tier.ink }]}>BitBack</Text>
          <View style={[styles.tierPill, { borderColor: tier.edge }]}>
            <Text style={[styles.tierText, { color: tier.edge }]}>
              {levelName} · {multiplier}×
            </Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <Chip size={width * 0.115} tint={tier.edge} />
          <Contactless size={width * 0.062} tint={tier.ink} />
        </View>

        <Text style={[styles.pan, { color: tier.ink }]}>
          {PAN_MASK}  {PAN_MASK}  {PAN_MASK}  {lastFour(seed)}
        </Text>

        <View style={styles.bottomRow}>
          <Text numberOfLines={1} style={[styles.holder, { color: tier.ink }]}>
            {holder.toUpperCase()}
          </Text>
          <View>
            <Text style={[styles.expiryLabel, { color: tier.ink }]}>VALID THRU</Text>
            <Text style={[styles.expiry, { color: tier.ink }]}>{expiry(seed)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { overflow: "hidden" },
  inner: { flex: 1, padding: space.lg, justifyContent: "space-between" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wordmark: {
    fontFamily: font.medium,
    fontSize: fontSize.body,
    letterSpacing: tracking.label,
  },
  tierPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  tierText: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: tracking.label,
  },
  chipRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  pan: {
    fontFamily: font.mono,
    fontSize: fontSize.body,
    letterSpacing: 1.5,
    opacity: 0.95,
  },
  bottomRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  holder: {
    fontFamily: font.medium,
    fontSize: 11,
    letterSpacing: tracking.label + 0.4,
    opacity: 0.88,
    flexShrink: 1,
    paddingRight: space.md,
  },
  expiryLabel: {
    fontFamily: font.regular,
    fontSize: 7,
    letterSpacing: 0.8,
    opacity: 0.55,
    textAlign: "right",
  },
  expiry: {
    fontFamily: font.mono,
    fontSize: 11,
    opacity: 0.88,
    textAlign: "right",
    marginTop: 1,
  },
});
