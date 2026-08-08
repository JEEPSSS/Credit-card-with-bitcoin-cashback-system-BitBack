import { Stack } from "expo-router";
import { COLORS } from "@/components/ui";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }} />;
}
