import { Tabs } from "expo-router";
import { Home, Repeat, Wallet, Flame, LayoutGrid } from "lucide-react-native";
import { COLORS } from "@/components/ui";
import { MIN_TOUCH_TARGET } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        sceneStyle: { backgroundColor: COLORS.bg },
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: MIN_TOUCH_TARGET + 34,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_400Regular" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Home size={21} color={color} /> }} />
      <Tabs.Screen name="simulate" options={{ title: "Transact", tabBarIcon: ({ color }) => <Repeat size={21} color={color} /> }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: ({ color }) => <Wallet size={21} color={color} /> }} />
      <Tabs.Screen name="boosts" options={{ title: "Boosts", tabBarIcon: ({ color }) => <Flame size={21} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color }) => <LayoutGrid size={21} color={color} /> }} />
    </Tabs>
  );
}
