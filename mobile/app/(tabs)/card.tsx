import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Coins, Flame, Lock, Send } from "@/components/icons";
import type { LucideIcon } from "@/components/icons";

import { rewardsAPI, transactionAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { sats } from "@/lib/format";
import {
  COLORS, MIN_TOUCH_TARGET, font, fontSize, iconSize, longestWordWidth, radius, space, tierOf,
  wordFitBasis,
} from "@/lib/theme";
import type { Level, RewardsSummary } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { refreshError } from "@/lib/screenState";
import { PaymentCard } from "@/components/PaymentCard";
import { ReceiptRow, toRow } from "@/components/ReceiptRow";
import { CardsSkeleton } from "@/components/Skeleton";
import { MaskedTabBar } from "@/components/reacticx/masked-tab-bar";
import { Async, Card, Divider, Header, Label, Num, Screen } from "@/components/ui";

/**
 * The card's own screen.
 *
 * The product is a card, and it had no screen: the card was a picture at the
 * top of Home and everything about it was somewhere else. Level sat in a stat
 * tile, the multiplier in a pill on the card face, the controls that change
 * what the card earns three taps away under More. A bank's app gives the card
 * a screen of its own with its controls directly under it, and this is that.
 *
 * Top to bottom: the card, what it has earned, the four settings that change
 * what it earns, how far it is from the next tier, and what it was last used
 * for. The second view lists every tier, so the progress bar has a legend.
 *
 * Nothing here is new data. It is the rewards summary and the first page of
 * transactions, both already loaded by Home, arranged around the card.
 */

const RECENT_COUNT = 3;
type CardView = "card" | "tiers";

const CONTROLS: { label: string; icon: LucideIcon; to: string }[] = [
  { label: "Boosts", icon: Flame, to: "/(tabs)/boosts" },
  { label: "Round-up", icon: Coins, to: "/roundup" },
  { label: "Auto-withdraw", icon: Send, to: "/auto-withdraw" },
  { label: "Security", icon: Lock, to: "/security" },
];

export default function CardScreen() {
  const { user } = useAuth();
  const [view, setView] = useState<CardView>("card");
  const { fontScale } = useWindowDimensions();

  const state = useApi(
    useCallback(async () => {
      const [summary, txs] = await Promise.all([rewardsAPI.summary(), transactionAPI.list(1)]);
      return { summary, txs: txs.items.slice(0, RECENT_COUNT) };
    }, []),
  );

  // "Auto-withdraw" breaks after its hyphen, so it is the halves that must fit:
  // sized on the whole word, the four controls wrapped three and one at 100%.
  const controlBasis = wordFitBasis(longestWordWidth("Auto- withdraw", fontSize.caption), fontScale);

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing} refreshError={refreshError(state)}>
      <Header title="Card" />

      <MaskedTabBar
        value={view}
        onValueChange={(v) => setView(v as CardView)}
        palette={SWITCH}
        height={MIN_TOUCH_TARGET}
        padding={space.xs}
        gap={0}
        fontSize={fontSize.caption + 1}
        fontWeight="400"
        style={styles.switch}
      >
        <MaskedTabBar.List>
          <MaskedTabBar.Trigger value="card" accessibilityLabel="Card">
            <MaskedTabBar.Label style={styles.switchLabel}>Card</MaskedTabBar.Label>
          </MaskedTabBar.Trigger>
          <MaskedTabBar.Trigger value="tiers" accessibilityLabel="Tier perks">
            <MaskedTabBar.Label style={styles.switchLabel}>Tier perks</MaskedTabBar.Label>
          </MaskedTabBar.Trigger>
        </MaskedTabBar.List>
      </MaskedTabBar>

      <Async state={state} skeleton={<CardsSkeleton count={3} />}>
        {({ summary, txs }) =>
          view === "tiers" ? (
            <Tiers summary={summary} />
          ) : (
            <>
              <PaymentCard
                levelKey={summary.level.key}
                levelName={summary.level.name}
                multiplier={summary.level.multiplier}
                holder={user?.display_name ?? "Cardholder"}
                seed={user?.id ?? 1}
              />

              <View style={styles.earned}>
                <Text style={styles.earnedLabel}>Earned on this card</Text>
                <Num size={fontSize.title}>{sats(summary.total_sats_earned)} sats</Num>
              </View>

              <View style={styles.controls}>
                {CONTROLS.map(({ label, icon: Icon, to }) => (
                  <Pressable
                    key={label}
                    onPress={() => router.push(to as any)}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    style={({ pressed }) => [
                      styles.control, { flexBasis: controlBasis, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={styles.controlDisc}>
                      <Icon size={iconSize.lg} color={COLORS.text} />
                    </View>
                    <Text style={styles.controlLabel}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              <Progress summary={summary} />

              <View style={styles.sectionHead}>
                <Label>Card transactions</Label>
                <Pressable
                  onPress={() => router.push("/history")}
                  accessibilityRole="link"
                  hitSlop={{ top: 16, bottom: 16, left: 12, right: 12 }}
                >
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              </View>
              <Divider />
              {txs.length === 0 ? (
                <Text style={styles.emptyLine}>Your first transaction will appear here.</Text>
              ) : (
                txs.map((t, i) => (
                  <ReceiptRow
                    key={t.id}
                    {...toRow(t)}
                    last={i === txs.length - 1}
                    onPress={() => router.push("/history")}
                  />
                ))
              )}
            </>
          )
        }
      </Async>
    </Screen>
  );
}

/** How far the card is from the next tier, and what the next tier is worth. */
function Progress({ summary }: { summary: RewardsSummary }) {
  const level = summary.level;
  const next = summary.levels.find((l) => l.name === level.next_level);
  const percent = Math.round(level.progress * 100);

  if (!next) {
    return (
      <Card style={styles.progress}>
        <Text style={styles.progressTitle}>{level.name}</Text>
        <Text style={styles.progressBody}>
          The top tier. Every purchase earns {level.multiplier}× the base rate.
        </Text>
      </Card>
    );
  }

  return (
    <Card style={styles.progress}>
      <View style={styles.progressHead}>
        <Text style={styles.progressTitle}>{level.name} to {next.name}</Text>
        <Num size={fontSize.caption} color={COLORS.muted}>{percent}%</Num>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Progress to ${next.name}`}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={styles.track}
      >
        <View style={[styles.fill, { width: `${Math.max(percent, 2)}%` }]} />
      </View>
      <Text style={styles.progressBody}>
        {sats(level.sats_to_next)} sats to go. {next.name} earns {next.multiplier}× on every purchase.
      </Text>
    </Card>
  );
}

/** Every tier, what it takes and what it pays, with the user's own marked. */
function Tiers({ summary }: { summary: RewardsSummary }) {
  return (
    <View style={{ gap: space.sm + 2 }}>
      <Text style={styles.tiersIntro}>
        Your tier is set by the sats you have earned in total, and it multiplies the cashback on
        every purchase.
      </Text>
      {summary.levels.map((l: Level) => {
        const current = l.key === summary.level.key;
        const reached = summary.total_sats_earned >= l.min_sats;
        const tier = tierOf(l.key);
        return (
          <View
            key={l.key}
            accessible
            accessibilityLabel={
              `${l.name}: from ${sats(l.min_sats)} sats, earns ${l.multiplier} times` +
              (current ? ". Your tier" : reached ? ". Reached" : "")
            }
            style={[styles.tier, { borderColor: current ? COLORS.accentBorder : COLORS.border }]}
          >
            <View style={[styles.swatch, { backgroundColor: tier.face, borderColor: tier.edge }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.tierName}>{l.name}</Text>
              <Text style={styles.tierFrom}>
                {l.min_sats === 0 ? "Where every card starts" : `From ${sats(l.min_sats)} sats`}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Num size={fontSize.body} color={reached ? COLORS.text : COLORS.muted}>{l.multiplier}×</Num>
              {current ? <Text style={styles.tierTag}>Your tier</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The switch: a raised pill on a sunken track, the pair the period chips use. */
const SWITCH = {
  track: COLORS.surface,
  pill: COLORS.elevated,
  inactive: COLORS.muted,
  active: COLORS.text,
} as const;

const styles = StyleSheet.create({
  switch: { borderWidth: 1, borderColor: COLORS.border, marginBottom: space.xl - 4 },
  switchLabel: { fontFamily: font.regular },
  earned: { alignItems: "center", marginTop: space.lg + 2, gap: space.xs },
  earnedLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: space.md,
    marginTop: space.xl - 2,
  },
  control: { flexGrow: 1, alignItems: "center", gap: space.sm },
  controlDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  controlLabel: { color: COLORS.bright, fontSize: fontSize.caption, textAlign: "center" },
  progress: { marginTop: space.xl - 2 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  progressTitle: { color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium, flexShrink: 1 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.raised,
    marginTop: space.md,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4, backgroundColor: COLORS.primary },
  progressBody: { color: COLORS.muted, fontSize: fontSize.caption, lineHeight: 19, marginTop: space.sm + 2 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.xl,
    marginBottom: space.xs,
  },
  seeAll: { color: COLORS.primary, fontSize: fontSize.caption },
  emptyLine: { color: COLORS.muted, fontSize: fontSize.caption, paddingVertical: space.xl, textAlign: "center" },
  tiersIntro: { color: COLORS.muted, fontSize: fontSize.caption, lineHeight: 20, marginBottom: space.sm },
  tier: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderRadius: radius.tile,
    padding: space.md + 2,
  },
  swatch: { width: 40, height: 26, borderRadius: 5, borderWidth: 1.5 },
  tierName: { color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium },
  tierFrom: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 },
  tierTag: { color: COLORS.primary, fontSize: fontSize.caption, marginTop: 2 },
});
