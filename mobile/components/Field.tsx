import { View, Text, TextInput, TextInputProps } from "react-native";

import { COLORS, MIN_TOUCH_TARGET, font, fontSize, radius, space } from "@/lib/theme";

/**
 * A labelled text input.
 *
 * `hint` and `error` are also given to the input as its accessibility hint, so
 * a screen reader reads them with the field instead of leaving them as stray
 * text further down (WCAG 2.2 3.3.1, error identification). An error replaces
 * the hint, turns the edge red and is announced as it appears.
 *
 * Pass `autoComplete` on account fields: it lets password managers and the
 * system autofill them (WCAG 1.3.5; Android core app quality, Autofill_Hints).
 */
export function Field({
  label, hint, error, mono, ...props
}: TextInputProps & { label: string; hint?: string; error?: string; mono?: boolean }) {
  const note = error || hint;
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginBottom: space.sm }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={note}
        placeholderTextColor={COLORS.placeholder}
        {...props}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: error ? COLORS.danger : COLORS.outline,
          borderRadius: radius.control,
          paddingHorizontal: space.md + 2,
          color: COLORS.text,
          fontSize: fontSize.body,
          fontFamily: mono ? font.mono : font.regular,
        }}
      />
      {note ? (
        <Text
          accessibilityLiveRegion={error ? "polite" : "none"}
          style={{ color: error ? COLORS.danger : COLORS.muted, fontSize: fontSize.caption, marginTop: 6 }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
