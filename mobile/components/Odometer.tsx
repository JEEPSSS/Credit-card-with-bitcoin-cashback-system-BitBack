import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, withDelay, Easing,
} from "react-native-reanimated";

/**
 * The balance is the one place the app spends its boldness, so it is the one
 * place that animates. Each digit column slides independently to its target,
 * staggered from the right, which is how a mechanical odometer settles.
 *
 * Digits are rendered as a fixed strip of 0-9 translated vertically rather than
 * as changing text, so the glyph never re-lays-out mid-animation and the
 * column width stays constant. Mono tabular figures make every column the
 * same width, which is what stops the whole number shifting as it rolls.
 */

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function DigitColumn({ value, height, fontSize, color, index }: {
  value: number; height: number; fontSize: number; color: string; index: number;
}) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withDelay(
      index * 45,
      withTiming(-value * height, { duration: 650, easing: Easing.out(Easing.cubic) }),
    );
  }, [value, height, index, offset]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <View style={{ height, overflow: "hidden" }}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <Text
            key={d}
            style={{
              height,
              lineHeight: height,
              fontSize,
              color,
              fontFamily: "JetBrainsMono_500Medium",
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
  value, fontSize = 40, color = "#F2F1EE", suffix,
}: {
  value: number; fontSize?: number; color?: string; suffix?: string;
}) {
  const height = Math.round(fontSize * 1.25);
  const chars = Math.round(value ?? 0).toLocaleString("en-US").split("");

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${Math.round(value ?? 0).toLocaleString("en-US")}${suffix ? ` ${suffix}` : ""}`}
    >
      {chars.map((c, i) =>
        c === "," ? (
          <Text
            key={`sep-${i}`}
            style={{ height, lineHeight: height, fontSize, color, fontFamily: "JetBrainsMono_500Medium" }}
          >
            ,
          </Text>
        ) : (
          <DigitColumn
            key={`d-${i}-${chars.length}`}
            index={chars.length - i}
            value={Number(c)}
            height={height}
            fontSize={fontSize}
            color={color}
          />
        ),
      )}
      {suffix ? (
        <Text style={{ color: "#93939A", fontSize: fontSize * 0.4, marginLeft: 8, marginBottom: fontSize * 0.12, alignSelf: "flex-end" }}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "flex-end" } });
