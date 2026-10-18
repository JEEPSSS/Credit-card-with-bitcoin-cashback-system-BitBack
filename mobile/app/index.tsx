import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/components/ui";
import { WakeBanner } from "@/components/WakeBanner";
import { space } from "@/lib/theme";

export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/(tabs)" : "/(auth)/login");
  }, [user, loading]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={COLORS.primary} />
      {/* Opening the app after a quiet spell is when the server is most often asleep. */}
      <WakeBanner style={{ marginTop: space.xl, marginHorizontal: space.xl }} />
    </View>
  );
}
