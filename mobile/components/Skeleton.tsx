import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";

import { COLORS, motion, radius, space } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Content-shaped loading placeholders.
 *
 * Every screen used to show a centred spinner. A spinner communicates only
 * "something is happening"; a skeleton communicates what is about to arrive and
 * where, so the layout does not jump when it does. That difference is most of
 * what makes an interface feel fast — the work is identical, the wait is not.
 *
 * The shimmer is one shared animation driven by a single shared value per
 * skeleton tree rather than one per bar, because dozens of independent timers
 * is exactly how a loading state ends up costing more than the content.
 *
 * With the OS "reduce motion" setting on, the shimmer stops and the bars render
 * at a flat mid opacity. A skeleton that pulses is decorative; a skeleton that
 * holds space is functional, and the functional part survives.
 */

function useShimmer() {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) {
      progress.value = 0.5;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: motion.shimmer, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [reduced, progress]);

  return useAnimatedStyle(() => ({ opacity: 0.35 + progress.value * 0.35 }));
}

export function Bar({
  width = "100%", height = 12, style,
}: {
  width?: number | `${number}%`; height?: number; style?: ViewStyle;
}) {
  const shimmer = useShimmer();
  return (
    <Animated.View
      style={[styles.bar, { width, height, borderRadius: height / 2 }, shimmer, style]}
    />
  );
}

export function Block({ height, style }: { height: number; style?: ViewStyle }) {
  const shimmer = useShimmer();
  return <Animated.View style={[styles.block, { height }, shimmer, style]} />;
}

/** The home screen: card, balance, action row, stat row, two receipt lines. */
export function HomeSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading your balance">
      <Block height={200} style={{ borderRadius: radius.payment }} />
      <View style={{ marginTop: space.xl }}>
        <Bar width="30%" height={10} />
        <Bar width="62%" height={34} style={{ marginTop: space.md }} />
        <Bar width="34%" height={14} style={{ marginTop: space.sm }} />
      </View>
      <View style={styles.row}>
        <Block height={MIN_BUTTON} style={{ flex: 1 }} />
        <Block height={MIN_BUTTON} style={{ flex: 1 }} />
      </View>
      <View style={styles.row}>
        {[0, 1, 2].map((i) => (
          <Block key={i} height={72} style={{ flex: 1 }} />
        ))}
      </View>
      <Block height={86} style={{ marginTop: space.xl }} />
      <ListSkeleton rows={3} />
    </View>
  );
}

/** Statement rows: icon puck, two text lines, right-aligned figure. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={{ marginTop: space.xl }} accessible accessibilityLabel="Loading transactions">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listRow}>
          <Block height={36} style={{ width: 36, borderRadius: radius.control }} />
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Bar width="55%" height={13} />
            <Bar width="34%" height={10} style={{ marginTop: space.sm }} />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Bar width={62} height={13} />
            <Bar width={44} height={10} style={{ marginTop: space.sm }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Wallet: balance, period switch, chart, ledger. */
export function ChartSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading your wallet">
      <Bar width="30%" height={10} />
      <Bar width="66%" height={34} style={{ marginTop: space.md }} />
      <Bar width="46%" height={14} style={{ marginTop: space.sm }} />
      <View style={styles.row}>
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} height={40} style={{ flex: 1 }} />
        ))}
      </View>
      <Block height={216} style={{ marginTop: space.lg }} />
      <ListSkeleton rows={4} />
    </View>
  );
}

/** Generic: a stack of cards, for the settings-shaped screens. */
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: space.md }} accessible accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Block key={i} height={96} />
      ))}
    </View>
  );
}

const MIN_BUTTON = 48;

const styles = StyleSheet.create({
  bar: { backgroundColor: COLORS.raised },
  block: { backgroundColor: COLORS.raised, borderRadius: radius.card },
  row: { flexDirection: "row", gap: space.sm + 2, marginTop: space.xl },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
});
