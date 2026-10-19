import { View, Text, Pressable, Linking, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  ChevronRight, ClipboardList, Clock, Coins, Gift, Lock, PartyPopper, Send, ShieldCheck, Sparkles,
  Target, User, Bell,
} from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { BASE_URL } from "@/lib/api";
import { Button, COLORS, Header, Label, Screen } from "@/components/ui";
import { MIN_TOUCH_TARGET, fontSize, iconSize, longestWordWidth, space, wordFitBasis } from "@/lib/theme";
import { BuildInfo } from "@/components/BuildInfo";

const GROUPS = [
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
  return (
    <Screen>
      <Header title="More" subtitle={user?.email} />
      {GROUPS.map((g) => (
        <View key={g.label} style={{ marginBottom: 24 }}>
          <Label>{g.label}</Label>
          <View style={{ marginTop: 10, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
            {g.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.to}
                  onPress={() => router.push(item.to as any)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 14,
                    paddingVertical: space.sm,
                    borderBottomWidth: i === g.items.length - 1 ? 0 : 1, borderBottomColor: COLORS.border,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Icon size={iconSize.md} color={COLORS.muted} />
                  {/* The note moves under the label once both no longer fit on one
                      line, rather than squeezing it until "Fraud protection" broke
                      mid-word at 200% text. */}
                  <View style={{ flex: 1, marginLeft: 12, marginRight: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 }}>
                    <Text
                      style={{
                        color: COLORS.text, fontSize: fontSize.body, flexGrow: 1, flexShrink: 1,
                        flexBasis: wordFitBasis(longestWordWidth(item.label, fontSize.body), fontScale),
                      }}
                    >
                      {item.label}
                    </Text>
                    {(item as any).note && <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>{(item as any).note}</Text>}
                  </View>
                  <ChevronRight size={iconSize.sm} color={COLORS.muted} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Button label="Sign out" variant="ghost" onPress={signOut} />
      <Pressable
        onPress={() => router.push("/delete-account" as any)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          alignItems: "center", justifyContent: "center", minHeight: MIN_TOUCH_TARGET, marginTop: 8,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Delete account</Text>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL(`${BASE_URL}/privacy`)}
        accessibilityRole="link"
        style={({ pressed }) => ({
          alignItems: "center", justifyContent: "center", minHeight: MIN_TOUCH_TARGET, opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Privacy policy</Text>
      </Pressable>
      <BuildInfo />
    </Screen>
  );
}
