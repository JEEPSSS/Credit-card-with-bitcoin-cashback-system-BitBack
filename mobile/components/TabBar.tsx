import { ComponentProps, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";

import { COLORS, MIN_TOUCH_TARGET, TAB_LABEL_MAX_FONT_SCALE, font, iconSize, space } from "@/lib/theme";
import { MaskedTabBar } from "@/components/reacticx/masked-tab-bar";

/**
 * The tab bar.
 *
 * It was the platform default: five icons on a hairline, the active one
 * orange. Correct, and identical to every other app built on the same kit.
 * This one is a single track with a pill that slides to the active tab, and
 * the tab's icon and label change colour only where the pill is over them,
 * so the selection reads as one object moving rather than two colours
 * swapping. The pill can also be dragged across the tabs. It is Reacticx's
 * MaskedTabBar (MIT; see components/reacticx), drawn with the app's own
 * colours.
 *
 * The pill is the accent's soft fill with the accent as ink, the same pair
 * every selected chip in the app uses. A solid orange pill was tried and
 * rejected: it competed with the one solid orange button a screen is allowed.
 *
 * Icon over label, not beside it: five tabs share a phone's width, and side
 * by side "Transact" does not fit a 360dp screen.
 */

/** What Expo Router hands a custom tab bar, taken from its own `Tabs`. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/**
 * Label size. Smaller than the caption the old bar used, because a tab is now
 * a fifth of the pill rather than a fifth of the screen: at 13 "Transact" was
 * cut short on a 360dp phone once text was set to 130%. iOS sets its own tab
 * labels at 10pt, so 11 is not small for the job, and it still grows with the
 * system text size up to TAB_LABEL_MAX_FONT_SCALE.
 */
const LABEL_SIZE = 11;

/** Tall enough for an icon over a label with a 48dp touch target inside. */
const BAR_HEIGHT = MIN_TOUCH_TARGET + space.md;
const BAR_PADDING = space.xs;

export function TabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const active = state.routes[state.index]?.name ?? "";

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

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <MaskedTabBar
        value={active}
        onValueChange={select}
        palette={PALETTE}
        height={BAR_HEIGHT}
        radius={BAR_HEIGHT / 2}
        padding={BAR_PADDING}
        gap={0}
        iconSize={iconSize.lg}
        fontSize={LABEL_SIZE}
        fontWeight="400"
        style={styles.track}
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
                <MaskedTabBar.Label maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SCALE} style={styles.label}>
                  {title}
                </MaskedTabBar.Label>
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
  pill: COLORS.accentSurface,
  inactive: COLORS.muted,
  active: COLORS.primary,
} as const;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  track: { borderWidth: 1, borderColor: COLORS.border },
  tab: { flexDirection: "column", gap: 2, paddingHorizontal: 0 },
  label: { fontFamily: font.regular },
});
