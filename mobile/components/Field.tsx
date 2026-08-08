import { View, Text, TextInput, TextInputProps } from "react-native";
import { COLORS } from "./ui";
import { MIN_TOUCH_TARGET } from "@/lib/theme";

export function Field({
  label, hint, mono, ...props
}: TextInputProps & { label: string; hint?: string; mono?: boolean }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: COLORS.muted, fontSize: 13, marginBottom: 8 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#5C5C63"
        {...props}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 8,
          paddingHorizontal: 14,
          color: COLORS.text,
          fontSize: 16,
          fontFamily: mono ? "JetBrainsMono_500Medium" : "Inter_400Regular",
        }}
      />
      {hint ? <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}
