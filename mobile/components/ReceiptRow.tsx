import { View, Text, Pressable } from "react-native";
import * as Icons from "lucide-react-native";
import { COLORS } from "./ui";
import { sats, relativeTime, titleCase } from "@/lib/format";
import { CATEGORY_ICON } from "@/lib/theme";

/**
 * A transaction is a line on a statement, not a card. Rows share one hairline
 * rule and one right-aligned mono column so the sats figures form a readable
 * column down the screen. Cards-per-row would break that alignment and triple
 * the vertical space.
 */
export function ReceiptRow({
  merchant, category, amountFiat, satsEarned, createdAt, riskScore, onPress, last,
}: {
  merchant: string; category: string; amountFiat: number; satsEarned: number;
  createdAt: string; riskScore?: number; onPress?: () => void; last?: boolean;
}) {
  const iconName = (CATEGORY_ICON as Record<string, string>)[category] ?? "credit-card";
  const Icon =
    (Icons as any)[
      iconName.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("")
    ] ?? Icons.CreditCard;

  const flagged = (riskScore ?? 0) >= 60;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: COLORS.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.elevated,
          alignItems: "center", justifyContent: "center", marginRight: 12,
        }}
      >
        <Icon size={17} color={COLORS.muted} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium", flexShrink: 1 }}>
            {merchant}
          </Text>
          {flagged && <Icons.ShieldAlert size={13} color={COLORS.danger} />}
        </View>
        <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
          {titleCase(category)} · {relativeTime(createdAt)}
        </Text>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: COLORS.primary, fontSize: 14, fontFamily: "JetBrainsMono_500Medium", fontVariant: ["tabular-nums"] }}>
          +{sats(satsEarned)}
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: 12, fontFamily: "JetBrainsMono_500Medium", fontVariant: ["tabular-nums"], marginTop: 2 }}>
          ${amountFiat.toFixed(2)}
        </Text>
      </View>
    </Pressable>
  );
}
