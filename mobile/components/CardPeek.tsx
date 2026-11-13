import { Pressable, StyleSheet, Text, View } from "react-native";

import { TIER, font, space, tierOf } from "@/lib/theme";
import type { TierKey } from "@/lib/theme";

/**
 * The card, seen edge-on at the side of Home.
 *
 * Home used to open on the full card, which pushed the balance and both
 * buttons below the fold on a small phone. The card now has a tab of its own,
 * and Home keeps this: the user's card standing at the screen edge, most of it
 * off-screen, with the next tier's card behind it. It does two jobs in very
 * little room. It says the product is a card, and it shows there is another
 * card to earn, which is the levelling system's whole pitch.
 *
 * Tapping it opens the Card tab. The part that is off-screen is never needed:
 * everything on it is repeated in full there.
 */

export const PEEK_WIDTH = 112;
export const PEEK_HEIGHT = 128;
/** How much of the front card shows inside the screen. */
export const PEEK_VISIBLE = 56;

const ORDER = Object.keys(TIER) as TierKey[];

/** The tier after this one, or null at the top. */
export function nextTier(levelKey: string): TierKey | null {
  const i = ORDER.indexOf(levelKey as TierKey);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null;
}

export function CardPeek({
  levelKey, levelName, lastFour, onPress,
}: {
  levelKey: string; levelName: string; lastFour: string; onPress: () => void;
}) {
  const tier = tierOf(levelKey);
  const upcoming = nextTier(levelKey);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your ${levelName} card. Open the Card tab`}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.75 : 1 }]}
    >
      {upcoming ? (
        <View
          style={[
            styles.card, styles.behind,
            { backgroundColor: TIER[upcoming].face, borderColor: TIER[upcoming].edge },
          ]}
        />
      ) : null}
      <View style={[styles.card, { backgroundColor: tier.face, borderColor: tier.edge }]}>
        <View style={[styles.chip, { backgroundColor: tier.edge }]} />
        <Text maxFontSizeMultiplier={1.2} style={[styles.digits, { color: tier.ink }]}>{lastFour}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    right: -(PEEK_WIDTH - PEEK_VISIBLE),
    width: PEEK_WIDTH,
    height: PEEK_HEIGHT,
  },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    borderWidth: 2,
    padding: space.md,
    justifyContent: "space-between",
  },
  behind: { transform: [{ translateX: -18 }, { rotate: "-3deg" }], opacity: 0.85 },
  chip: { width: 22, height: 17, borderRadius: 4, opacity: 0.92 },
  digits: { fontFamily: font.mono, fontSize: 10, letterSpacing: 0.5, opacity: 0.9 },
});
