import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import * as Icons from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { Button, COLORS, Header, Label, Screen } from "@/components/ui";
import { fontSize, iconSize } from "@/lib/theme";

const GROUPS = [
  {
    label: "Intelligence",
    items: [
      { icon: "Sparkles", label: "AI insights", to: "/ai-insights", note: "All five models" },
      { icon: "ShieldCheck", label: "Fraud protection", to: "/fraud", note: "Isolation Forest" },
    ],
  },
  {
    label: "Your money",
    items: [
      { icon: "Target", label: "Savings goals", to: "/goals" },
      { icon: "Coins", label: "Round-up", to: "/roundup" },
      { icon: "Send", label: "Auto-withdraw", to: "/auto-withdraw" },
      { icon: "Bell", label: "Price alerts", to: "/alerts" },
    ],
  },
  {
    label: "Account",
    items: [
      { icon: "User", label: "Profile and badges", to: "/profile" },
      { icon: "Gift", label: "Referrals", to: "/referral" },
      { icon: "Lock", label: "Security", to: "/security" },
      { icon: "Clock", label: "Transaction history", to: "/history" },
      { icon: "PartyPopper", label: "Monthly recap", to: "/recap" },
    ],
  },
  {
    label: "Help us build this",
    items: [
      { icon: "ClipboardList", label: "Product research survey", to: "/survey", note: "2 min, anonymous" },
    ],
  },
];

export default function More() {
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <Header title="More" subtitle={user?.email} />
      {GROUPS.map((g) => (
        <View key={g.label} style={{ marginBottom: 24 }}>
          <Label>{g.label}</Label>
          <View style={{ marginTop: 10, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
            {g.items.map((item, i) => {
              const Icon = (Icons as any)[item.icon];
              return (
                <Pressable
                  key={item.to}
                  onPress={() => router.push(item.to as any)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 14,
                    borderBottomWidth: i === g.items.length - 1 ? 0 : 1, borderBottomColor: COLORS.border,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Icon size={iconSize.md} color={COLORS.muted} />
                  <Text style={{ color: COLORS.text, fontSize: fontSize.body, marginLeft: 12, flex: 1 }}>{item.label}</Text>
                  {(item as any).note && <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginRight: 8 }}>{(item as any).note}</Text>}
                  <Icons.ChevronRight size={iconSize.sm} color={COLORS.muted} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
