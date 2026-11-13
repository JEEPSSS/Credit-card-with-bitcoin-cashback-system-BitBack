import { ComponentProps, useCallback, useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";

import { COLORS, DOCK_HEIGHT, DOCK_MARGIN, iconSize, space } from "@/lib/theme";
import { MaskedTabBar } from "@/components/reacticx/masked-tab-bar";

/**
 * The tab bar: a dock that floats over the screen.
 *
 * It is a dark, fully rounded bar inset from the screen edges, with the active
 * tab marked by a solid accent pill that slides between tabs and can be
 * dragged (Reacticx's MaskedTabBar, MIT; see components/reacticx). Floating
 * rather than docked to the bottom edge is what lets Home's light sheet run
 * underneath it, and it is how the banking apps this layout is drawn from
 * place theirs.
 *
 * Icons only. Five labelled tabs do not fit a dock this narrow on a 360dp
 * phone, and the earlier bar had already shrunk its labels to 11pt to fit.
 * Each tab still carries its title as its spoken name, so a screen reader
 * announces "Home, tab, selected" exactly as before.
 *
 * The accent pill was held back in the first version of this bar because it
 * competed with the screen's one solid orange button. It no longer does: the
 * dock now sits apart from the content, over the sheet or the canvas, and the
 * pill is the only thing on it.
 */

/** What Expo Router hands a custom tab bar, taken from its own `Tabs`. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const DOCK_PADDING = space.xs;

/**
 * The dock covers whatever is behind it, so it steps aside while the keyboard
 * is up; otherwise on Android it rides up over the field being typed in.
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

export function TabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const active = state.routes[state.index]?.name ?? "";
  const keyboardOpen = useKeyboardOpen();

  const select = useCallback(
    (name: string) => {
      const route = state.routes.find((r) => r.name === name);
      if (!route) return;
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) return;
      void Haptics.selectionAsync();
      navigation.navigate(route.name, route.params);
    },
    [state.routes, navigation],
  );

  if (keyboardOpen) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, DOCK_MARGIN) }]}
    >
      <MaskedTabBar
        value={active}
        onValueChange={select}
        palette={PALETTE}
        height={DOCK_HEIGHT}
        radius={DOCK_HEIGHT / 2}
        padding={DOCK_PADDING}
        gap={0}
        iconSize={iconSize.lg + 1}
        style={styles.dock}
      >
        <MaskedTabBar.List>
          {state.routes.map((route) => {
            const options = descriptors[route.key]?.options ?? {};
            const title = options.title ?? route.name;
            return (
              <MaskedTabBar.Trigger
                key={route.key}
                value={route.name}
                accessibilityLabel={title}
                style={styles.tab}
              >
                <MaskedTabBar.Icon>
                  {({ color, size, active: focused }) =>
                    options.tabBarIcon?.({ focused, color, size }) ?? null
                  }
                </MaskedTabBar.Icon>
              </MaskedTabBar.Trigger>
            );
          })}
        </MaskedTabBar.List>
      </MaskedTabBar>
    </View>
  );
}

const PALETTE = {
  track: COLORS.surface,
  pill: COLORS.primary,
  inactive: COLORS.muted,   // 5.9:1 on the track
  active: COLORS.onPrimary, // 8.1:1 on the pill
} as const;

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: space.xl, right: space.xl },
  dock: { borderWidth: 1, borderColor: COLORS.border },
  tab: { paddingHorizontal: 0 },
});
