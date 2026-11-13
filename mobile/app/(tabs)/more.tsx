import { useCallback } from "react";
import { View, Text, Pressable, Linking, StyleSheet, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  ChevronRight, ClipboardList, Clock, Coins, Gift, Lock, PartyPopper, Send, ShieldCheck, Sparkles,
  Target, Trash2, User, Bell,
} from "@/components/icons";
import type { LucideIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { BASE_URL, rewardsAPI } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/components/Avatar";
import { Button, COLORS, Header, Label, Screen } from "@/components/ui";
import {
  MIN_TOUCH_TARGET, font, fontSize, iconSize, longestWordWidth, radius, space, tierOf, wordFitBasis,
} from "@/lib/theme";
import { BuildInfo } from "@/components/BuildInfo";

/**
 * More: the account, then everything that is not a tab.
 *
 * It opens on who is signed in, with their tier, as a card that leads to the
 * profile: the settings screen of every banking app starts this way, because
 * the first thing to confirm on a screen that can sign you out or delete your
 * account is whose account it is. The email used to be a line of grey text
 * under the title.
 *
 * Each row's icon sits in a small tile. A bare 17pt glyph at the start of a
 * row was the weakest thing on it; the tile gives the rows a firm left edge
 * and makes a group read as a list of destinations rather than of sentences.
 *
 * Deleting the account is the last row of the Account group, in the danger
 * colour, instead of a grey link under the sign-out button, where it looked
 * like a footnote and sat a thumb's width from "Privacy policy".
 */

type Item = { icon: LucideIcon; label: string; to: string; note?: string; danger?: boolean };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Intelligence",
    items: [
      { icon: Sparkles, label: "AI insights", to: "/ai-insights", note: "Four models" },
      { icon: ShieldCheck, label: "Fraud protection", to: "/fraud", note: "Isolation Forest" },
    ],
  },
  {
    label: "Your money",
    items: [
      { icon: Target, label: "Savings goals", to: "/goals" },
      { icon: Coins, label: "Round-up", to: "/roundup" },
      { icon: Send, label: "Auto-withdraw", to: "/auto-withdraw" },
      { icon: Bell, label: "Price alerts", to: "/alerts" },
    ],
  },
  {
    label: "Account",
    items: [
      { icon: User, label: "Profile and badges", to: "/profile" },
      { icon: Gift, label: "Referrals", to: "/referral" },
      { icon: Lock, label: "Security", to: "/security" },
      { icon: Clock, label: "Transaction history", to: "/history" },
      { icon: PartyPopper, label: "Monthly recap", to: "/recap" },
      { icon: Trash2, label: "Delete account", to: "/delete-account", danger: true },
    ],
  },
  {
    label: "Help us build this",
    items: [
      { icon: ClipboardList, label: "Product research survey", to: "/survey", note: "2 min, anonymous" },
    ],
  },
];

export default function More() {
  const { user, signOut } = useAuth();
  const { fontScale } = useWindowDimensions();

  // Only for the tier chip and the badge count. If it fails the screen is
  // still complete without them, so the failure is not shown.
  const rewards = useApi(useCallback(() => rewardsAPI.summary(), []));
  const level = rewards.data?.level;
  const badges = rewards.data?.badges;
  const tier = level ? tierOf(level.key) : null;

  const noteFor = (item: Item) =>
    item.to === "/profile" && badges ? `${badges.earned_count} of ${badges.total_count}` : item.note;

  return (
    <Screen>
      <Header title="More" />

      <Pressable
        onPress={() => router.push("/profile")}
        accessibilityRole="button"
        accessibilityLabel={
          `${user?.display_name ?? "Your account"}, ${user?.email ?? ""}` +
          (level ? `, ${level.name} tier` : "") + ". Open profile"
        }
        style={({ pressed }) => [styles.account, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Avatar name={user?.display_name} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.accountName}>{user?.display_name ?? "Your account"}</Text>
          <Text numberOfLines={1} style={styles.accountEmail}>{user?.email}</Text>
        </View>
        {level && tier ? (
          <View style={[styles.tierChip, { borderColor: tier.edge }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.tierText, { color: tier.edge }]}>{level.name}</Text>
          </View>
        ) : null}
      </Pressable>

      {GROUPS.map((g) => (
        <View key={g.label} style={{ marginBottom: space.xl }}>
          <Label>{g.label}</Label>
          <View style={styles.group}>
            {g.items.map((item, i) => {
              const Icon = item.icon;
              const note = noteFor(item);
              const ink = item.danger ? COLORS.danger : COLORS.text;
              return (
                <Pressable
                  key={item.to}
                  onPress={() => router.push(item.to as any)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    { borderTopWidth: i === 0 ? 0 : 1, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <View style={[styles.iconTile, item.danger && { backgroundColor: COLORS.dangerSoft }]}>
                    <Icon size={iconSize.md} color={item.danger ? COLORS.danger : COLORS.bright} />
                  </View>
                  {/* The note moves under the label once both no longer fit on one
                      line, rather than squeezing it until "Fraud protection" broke
                      mid-word at 200% text. */}
                  <View style={styles.rowText}>
                    <Text
                      style={{
                        color: ink, fontSize: fontSize.body, flexGrow: 1, flexShrink: 1, flexBasis: 0,
                        minWidth: wordFitBasis(longestWordWidth(item.label, fontSize.body), fontScale),
                      }}
                    >
                      {item.label}
                    </Text>
                    {note ? <Text style={styles.note}>{note}</Text> : null}
                  </View>
                  {item.danger ? null : <ChevronRight size={iconSize.sm} color={COLORS.subtle} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Button label="Sign out" variant="ghost" onPress={signOut} />
      <Pressable
        onPress={() => Linking.openURL(`${BASE_URL}/privacy`)}
        accessibilityRole="link"
        style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={styles.note}>Privacy policy</Text>
      </Pressable>
      <BuildInfo />
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: radius.card,
    padding: space.md + 2,
    marginBottom: space.xl,
  },
  accountName: { color: COLORS.text, fontSize: fontSize.body + 1, fontFamily: font.medium },
  accountEmail: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 },
  tierChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 4 },
  tierText: { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.5 },
  group: {
    marginTop: space.sm + 2,
    backgroundColor: COLORS.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm + 2,
    borderTopColor: COLORS.hairline,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.raised,
  },
  rowText: {
    flex: 1,
    marginLeft: space.md,
    marginRight: space.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.sm,
  },
  note: { color: COLORS.muted, fontSize: fontSize.caption },
  link: { alignItems: "center", justifyContent: "center", minHeight: MIN_TOUCH_TARGET, marginTop: space.sm },
});
