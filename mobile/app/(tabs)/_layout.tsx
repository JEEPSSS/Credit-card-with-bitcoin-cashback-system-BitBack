import { Tabs } from "expo-router";
import { Home, Repeat, Wallet, Flame, LayoutGrid } from "@/components/icons";
import { COLORS } from "@/components/ui";
import { TabBar } from "@/components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      // The bar itself, its colours and its sizes live in components/TabBar.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: COLORS.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }} />
      <Tabs.Screen name="simulate" options={{ title: "Transact", tabBarIcon: ({ color, size }) => <Repeat size={size} color={color} /> }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: ({ color, size }) => <Wallet size={size} color={color} /> }} />
      <Tabs.Screen name="boosts" options={{ title: "Boosts", tabBarIcon: ({ color, size }) => <Flame size={size} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} /> }} />
    </Tabs>
  );
}
