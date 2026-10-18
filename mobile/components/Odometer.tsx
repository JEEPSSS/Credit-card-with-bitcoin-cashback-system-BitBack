import { useEffect } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";

import { COLORS, MAX_DISPLAY_FONT_SCALE, font, motion, scaledLineHeight, tracking } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The balance is the one place the app spends its boldness, so it is the one
 * place that animates. Each digit column slides independently to its target,
 * staggered from the right, which is how a mechanical odometer settles.
 *
 * Digits are rendered as a fixed strip of 0-9 translated vertically rather than
 * as changing text, so the glyph never re-lays-out mid-animation and the
 * column width stays constant. Mono tabular figures make every column the
 * same width, which is what stops the whole number shifting as it rolls.
 *
 * With the OS reduce-motion setting on, every column jumps straight to its
 * digit. The number is still correct and still legible; only the roll is lost.
 */

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function DigitColumn({ value, height, lineHeight, fontSize, color, index, instant }: {
  value: number; height: number; lineHeight: number; fontSize: number; color: string;
  index: number; instant: boolean;
}) {
  const offset = useSharedValue(0);

  useEffect(() => {
    const target = -value * height;
    if (instant) {
      offset.value = target;
      return;
    }
    offset.value = withDelay(
      index * motion.odometerStagger,
      withTiming(target, { duration: motion.odometer, easing: Easing.out(Easing.cubic) }),
    );
  }, [value, height, index, offset, instant]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <View style={{ height, overflow: "hidden" }}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <Text
            key={d}
            maxFontSizeMultiplier={MAX_DISPLAY_FONT_SCALE}
            style={{
              height,
              lineHeight,
              fontSize,
              color,
              fontFamily: font.mono,
              fontVariant: ["tabular-nums"],
            }}
          >
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export function Odometer({
  value, fontSize = 40, color = COLORS.text, suffix,
}: {
  value: number; fontSize?: number; color?: string; suffix?: string;
}) {
  const reduced = useReducedMotion();
  // The digits scale with the system text size, so the window they roll
  // behind must too; sized from the unscaled font, large text was clipped.
  // The Text's own lineHeight is given unscaled: Android and iOS scale
  // lineHeight with the font, and passing the scaled height scaled it twice,
  // which pushed each digit below its window (found at 130% and 200% text).
  const height = scaledLineHeight(fontSize, useWindowDimensions().fontScale);
  const lineHeight = scaledLineHeight(fontSize, 1);
  const rounded = Math.round(value ?? 0);
  const chars = rounded.toLocaleString("en-US").split("");

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${rounded.toLocaleString("en-US")}${suffix ? ` ${suffix}` : ""}`}
    >
      {chars.map((c, i) =>
        c === "," ? (
          <Text
            key={`sep-${i}`}
            maxFontSizeMultiplier={MAX_DISPLAY_FONT_SCALE}
            style={{
              height,
              lineHeight,
              fontSize,
              color,
              fontFamily: font.mono,
              letterSpacing: tracking.display,
            }}
          >
            ,
          </Text>
        ) : (
          <DigitColumn
            key={`d-${i}-${chars.length}`}
            index={chars.length - i}
            value={Number(c)}
            height={height}
            lineHeight={lineHeight}
            fontSize={fontSize}
            color={color}
            instant={reduced}
          />
        ),
      )}
      {suffix ? (
        <Text
          maxFontSizeMultiplier={MAX_DISPLAY_FONT_SCALE}
          style={{
            color: COLORS.muted,
            fontSize: fontSize * 0.4,
            marginLeft: 8,
            marginBottom: fontSize * 0.12,
            alignSelf: "flex-end",
          }}
        >
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "flex-end" } });
