import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  ArrowUpRight, Bell, Coins, Flame, LayoutGrid, Sparkles, Target, TrendingDown, TrendingUp, Wallet,
} from "@/components/icons";
import type { LucideIcon } from "@/components/icons";

import { miscAPI, rewardsAPI, transactionAPI, walletAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { titleCase, usd } from "@/lib/format";
import {
  COLORS, MAX_DISPLAY_FONT_SCALE, MIN_TOUCH_TARGET, font, fontSize, iconSize, longestWordWidth,
  radius, space, wordFitBasis,
} from "@/lib/theme";
import { useApi } from "@/lib/useApi";
import { refreshError } from "@/lib/screenState";
import { Avatar } from "@/components/Avatar";
import { Beam } from "@/components/Beam";
import { CardPeek, PEEK_HEIGHT, PEEK_VISIBLE } from "@/components/CardPeek";
import { Odometer } from "@/components/Odometer";
import { lastFour } from "@/components/PaymentCard";
import { ReceiptRow, toRow } from "@/components/ReceiptRow";
import { openReceipt } from "@/components/Receipt";
import { HomeSkeleton } from "@/components/Skeleton";
import { Card, ErrorNote, Num, Screen, useTabInset } from "@/components/ui";

/**
 * Home.
 *
 * The layout is the one the better banking apps converge on, top to bottom:
 * whose account this is, one figure, the two things you came to do, shortcuts
 * to the rest, and the recent statement. Each band answers one question, and
 * nothing asks to be read before the balance.
 *
 * What changed from the first version, and why:
 *
 * - The full card moved to its own tab. On a 360dp phone it took the top third
 *   of the screen and pushed the balance and both buttons below the fold. Its
 *   edge still stands at the side of the balance; see components/CardPeek.
 * - Three stat tiles (streak, level, badges) became one line of text and two
 *   links. They were three boxes of equal weight for three facts of unequal
 *   use: level lives on the Card tab, badges on the profile.
 * - Recent activity sits on a light sheet. It is the only light surface in the
 *   app, and it turns the last band from more dark rows into the statement.
 */

const RECENT_COUNT = 3;

/** Width of a mono digit, in em. JetBrains Mono's advance is 0.6em. */
const MONO_EM = 0.6;

const SHORTCUTS: { label: string; icon: LucideIcon; to: string }[] = [
  { label: "Boosts", icon: Flame, to: "/(tabs)/boosts" },
  { label: "Round-up", icon: Coins, to: "/roundup" },
  { label: "Goals", icon: Target, to: "/goals" },
  { label: "Insights", icon: Sparkles, to: "/ai-insights" },
];

export default function Home() {
  const { user } = useAuth();
  const tabInset = useTabInset();

  const state = useApi(
    useCallback(async () => {
      const [wallet, price, summary, txs, notifs] = await Promise.all([
        walletAPI.balance(),
        miscAPI.btcPrice(),
        rewardsAPI.summary(),
        transactionAPI.list(1),
        miscAPI.notifications(),
      ]);
      return {
        wallet, price, summary,
        txs: txs.items.slice(0, RECENT_COUNT),
        unread: notifs.unread_count,
      };
    }, []),
  );

  const { fontScale, width } = useWindowDimensions();
  const shortcutBasis = wordFitBasis(longestWordWidth("Round-up", fontSize.caption), fontScale, space.sm);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen
      padded={false}
      bottomInset={false}
      fill
      onRefresh={state.refresh}
      refreshing={state.refreshing}
      refreshError={refreshError(state)}
    >
      <View style={[styles.pad, styles.topBar]}>
        <View style={styles.who}>
          <Avatar name={user?.display_name} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text numberOfLines={1} style={styles.name}>{user?.display_name ?? "there"}</Text>
          </View>
        </View>
        <NotificationBell unread={state.data?.unread ?? 0} />
      </View>

      {state.data === null ? (
        <View style={styles.pad}>
          {state.error ? <ErrorNote message={state.error} onRetry={state.reload} /> : <HomeSkeleton />}
        </View>
      ) : (
        (() => {
          const { wallet, price, summary, txs } = state.data;
          const up = price.change_24h >= 0;

          // The card's edge shares a row with the balance, so it is only drawn
          // when the figure leaves it room: a nine-digit balance, or text set
          // large, takes the full width and the card gives way.
          const figure = Math.round(wallet.balance_sats).toLocaleString("en-US");
          const textScale = Math.min(Math.max(fontScale, 1), MAX_DISPLAY_FONT_SCALE);
          const figureWidth =
            figure.length * fontSize.display * MONO_EM * textScale +
            space.sm + 4 * fontSize.display * 0.4 * MONO_EM * textScale;
          const showPeek = figureWidth + space.lg + PEEK_VISIBLE <= width - space.lg;

          return (
            <>
              <View style={styles.pad}>
                <View style={[styles.balance, showPeek && { minHeight: PEEK_HEIGHT }]}>
                  <Text style={styles.balanceLabel}>Total balance</Text>
                  <View style={{ marginTop: space.sm }}>
                    <Odometer value={wallet.balance_sats} fontSize={fontSize.display} suffix="sats" />
                  </View>
                  <View style={styles.subRow}>
                    <Num size={fontSize.caption} color={COLORS.muted}>{usd(wallet.balance_usd)}</Num>
                    <View style={styles.price}>
                      <Text style={styles.priceLabel}>BTC</Text>
                      <Num size={fontSize.caption} color={COLORS.muted}>{usd(price.price)}</Num>
                      {up ? (
                        <TrendingUp size={iconSize.xs} color={COLORS.success} />
                      ) : (
                        <TrendingDown size={iconSize.xs} color={COLORS.danger} />
                      )}
                      <Num size={fontSize.caption} color={up ? COLORS.success : COLORS.danger}>
                        {up ? "+" : ""}{price.change_24h.toFixed(2)}%
                      </Num>
                    </View>
                  </View>
                  {showPeek ? (
                    <CardPeek
                      levelKey={summary.level.key}
                      levelName={summary.level.name}
                      lastFour={lastFour(user?.id ?? 1)}
                      onPress={() => router.push("/(tabs)/card")}
                    />
                  ) : null}
                </View>

                <View style={styles.actions}>
                  <Pill primary label="Pay" icon={ArrowUpRight} onPress={() => router.push("/simulate")} />
                  <Pill label="Wallet" icon={Wallet} onPress={() => router.push("/(tabs)/wallet")} />
                  <Pressable
                    onPress={() => router.push("/(tabs)/more")}
                    accessibilityRole="button"
                    accessibilityLabel="More"
                    style={({ pressed }) => [styles.round, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <LayoutGrid size={iconSize.lg} color={COLORS.text} />
                  </Pressable>
                </View>

                <Card style={styles.shortcuts}>
                  <View style={styles.shortcutsHead}>
                    <Text style={styles.shortcutsTitle}>Quick actions</Text>
                    <View style={styles.streak}>
                      <Flame size={iconSize.xs} color={COLORS.primary} />
                      <Text style={styles.shortcutsTitle}>
                        {summary.streak.current}-day streak
                      </Text>
                    </View>
                  </View>
                  <View style={styles.shortcutRow}>
                    {SHORTCUTS.map(({ label, icon: Icon, to }) => (
                      <Pressable
                        key={label}
                        onPress={() => router.push(to as any)}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        style={({ pressed }) => [
                          styles.shortcut, { flexBasis: shortcutBasis, opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <View style={styles.shortcutTile}>
                          <Icon size={iconSize.lg} color={COLORS.primary} />
                        </View>
                        <Text style={styles.shortcutLabel}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Card>

                {summary.active_boost && (
                  <Beam style={{ marginTop: space.md }}>
                    <Card tone="accent" onPress={() => router.push("/(tabs)/boosts")} style={styles.boost}>
                      <Flame size={iconSize.md} color={COLORS.primary} />
                      <Text style={styles.boostTitle}>
                        {titleCase(summary.active_boost.category)} boost active
                      </Text>
                      <Num size={fontSize.body} color={COLORS.primary}>
                        {summary.active_boost.multiplier}×
                      </Num>
                    </Card>
                  </Beam>
                )}
              </View>

              <View style={[styles.sheet, { paddingBottom: tabInset + space.xl }]}>
                <View style={styles.sheetHead}>
                  <Text accessibilityRole="header" style={styles.sheetTitle}>Recent activity</Text>
                  <Pressable
                    onPress={() => router.push("/history")}
                    accessibilityRole="link"
                    hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
                    style={styles.seeAll}
                  >
                    <Text style={styles.seeAllText}>See all</Text>
                    <ArrowUpRight size={iconSize.sm} color={COLORS.inkMuted} />
                  </Pressable>
                </View>
                {txs.length === 0 ? (
                  <Text style={styles.emptyLine}>Your first transaction will appear here.</Text>
                ) : (
                  txs.map((t) => (
                    <ReceiptRow key={t.id} paper {...toRow(t)} onPress={() => openReceipt(t)} />
                  ))
                )}
              </View>
            </>
          );
        })()
      )}
    </Screen>
  );
}

function NotificationBell({ unread }: { unread: number }) {
  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      style={({ pressed }) => [styles.bell, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Bell size={iconSize.lg} color={COLORS.text} />
      {unread > 0 && <View style={styles.bellDot} />}
    </Pressable>
  );
}

/**
 * The two things Home is for. A pill, with its icon in a disc at the leading
 * edge: fully rounded so they read as buttons at a glance and as a different
 * kind of thing from the cards below them. One is solid; a screen gets one
 * solid orange control, and here it is paying.
 */
function Pill({
  label, icon: Icon, onPress, primary,
}: {
  label: string; icon: LucideIcon; onPress: () => void; primary?: boolean;
}) {
  const ink = primary ? COLORS.onPrimary : COLORS.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pill,
        primary ? styles.pillPrimary : styles.pillPlain,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.pillDisc, { backgroundColor: primary ? COLORS.primaryPressed : COLORS.elevated }]}>
        <Icon size={iconSize.md} color={ink} />
      </View>
      <Text style={[styles.pillLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.lg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  who: { flexDirection: "row", alignItems: "center", gap: space.md, flexShrink: 1 },
  greeting: { color: COLORS.muted, fontSize: fontSize.caption },
  name: { color: COLORS.text, fontSize: fontSize.body + 1, fontFamily: font.medium, marginTop: 1 },
  bell: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bellDot: {
    position: "absolute",
    top: 11,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  balance: { justifyContent: "center" },
  balanceLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  subRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.md,
    rowGap: space.xs,
    marginTop: space.sm,
  },
  price: { flexDirection: "row", alignItems: "center", gap: space.xs + 1 },
  priceLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm + 2,
    marginTop: space.xl,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm + 2,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.pill,
    paddingLeft: space.xs + 2,
    paddingRight: space.xl - 4,
    paddingVertical: space.xs + 2,
  },
  pillPrimary: { backgroundColor: COLORS.primary },
  pillPlain: { backgroundColor: COLORS.raised, borderWidth: 1, borderColor: COLORS.border },
  pillDisc: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pillLabel: { fontSize: fontSize.body, fontFamily: font.medium },
  round: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.raised,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginLeft: "auto",
  },
  shortcuts: { marginTop: space.xl - 4, paddingHorizontal: space.md, paddingVertical: space.md + 2 },
  shortcutsHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: space.md,
    paddingHorizontal: space.xs + 2,
  },
  shortcutsTitle: { color: COLORS.muted, fontSize: fontSize.caption },
  streak: { flexDirection: "row", alignItems: "center", gap: space.xs + 1 },
  shortcutRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: space.md,
    marginTop: space.md + 2,
  },
  shortcut: { flexGrow: 1, alignItems: "center", gap: space.sm },
  shortcutTile: {
    width: 52,
    height: 52,
    borderRadius: radius.tile,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.raised,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shortcutLabel: { color: COLORS.bright, fontSize: fontSize.caption, textAlign: "center" },
  boost: { flexDirection: "row", alignItems: "center", gap: space.sm + 2, paddingVertical: space.md + 2 },
  boostTitle: { color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium, flex: 1 },
  sheet: {
    flexGrow: 1,
    marginTop: space.xl,
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingTop: space.lg + 2,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xs,
    marginBottom: space.xs,
  },
  sheetTitle: { color: COLORS.ink, fontSize: fontSize.body, fontFamily: font.medium },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { color: COLORS.inkMuted, fontSize: fontSize.caption },
  emptyLine: {
    color: COLORS.inkMuted,
    fontSize: fontSize.caption,
    paddingVertical: space.xl,
    textAlign: "center",
  },
});
