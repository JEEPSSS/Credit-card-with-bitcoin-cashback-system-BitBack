import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CreditCard, Flame, Home, LayoutGrid, Wallet } from "@/components/icons";
import { COLORS, TabInsetContext } from "@/components/ui";
import { TabBar } from "@/components/TabBar";
import { DOCK_HEIGHT, DOCK_MARGIN } from "@/lib/theme";

export default function TabsLayout() {
  // The dock floats, so every tab screen leaves room for it; see TabInsetContext.
  const { bottom } = useSafeAreaInsets();
  const inset = DOCK_HEIGHT + Math.max(bottom, DOCK_MARGIN);

  return (
    <TabInsetContext.Provider value={inset}>
      <Tabs
        // The bar itself, its colours and its sizes live in components/TabBar.
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: COLORS.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }} />
        <Tabs.Screen name="card" options={{ title: "Card", tabBarIcon: ({ color, size }) => <CreditCard size={size} color={color} /> }} />
        <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: ({ color, size }) => <Wallet size={size} color={color} /> }} />
        <Tabs.Screen name="boosts" options={{ title: "Boosts", tabBarIcon: ({ color, size }) => <Flame size={size} color={color} /> }} />
        <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} /> }} />
      </Tabs>
    </TabInsetContext.Provider>
  );
}
