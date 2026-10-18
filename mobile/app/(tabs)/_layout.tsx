import { Text } from "react-native";
import { Tabs } from "expo-router";
import { Home, Repeat, Wallet, Flame, LayoutGrid } from "@/components/icons";
import { COLORS } from "@/components/ui";
import { MIN_TOUCH_TARGET, TAB_LABEL_MAX_FONT_SCALE, font, fontSize, iconSize } from "@/lib/theme";

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
        tabBarLabel: ({ color, children }) => (
          <Text
            maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SCALE}
            numberOfLines={1}
            style={{ color, fontSize: fontSize.caption, fontFamily: font.regular }}
          >
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Home size={iconSize.lg} color={color} /> }} />
      <Tabs.Screen name="simulate" options={{ title: "Transact", tabBarIcon: ({ color }) => <Repeat size={iconSize.lg} color={color} /> }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: ({ color }) => <Wallet size={iconSize.lg} color={color} /> }} />
      <Tabs.Screen name="boosts" options={{ title: "Boosts", tabBarIcon: ({ color }) => <Flame size={iconSize.lg} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color }) => <LayoutGrid size={iconSize.lg} color={color} /> }} />
    </Tabs>
  );
}
