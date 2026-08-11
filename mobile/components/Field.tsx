import { View, Text, TextInput, TextInputProps } from "react-native";

import { COLORS, MIN_TOUCH_TARGET, font, fontSize, radius, space } from "@/lib/theme";

export function Field({
  label, hint, mono, ...props
}: TextInputProps & { label: string; hint?: string; mono?: boolean }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginBottom: 8 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={COLORS.placeholder}
        {...props}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 8,
          paddingHorizontal: 14,
          color: COLORS.text,
          fontSize: fontSize.body,
          fontFamily: mono ? font.mono : font.regular,
        }}
      />
      {hint ? <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}
