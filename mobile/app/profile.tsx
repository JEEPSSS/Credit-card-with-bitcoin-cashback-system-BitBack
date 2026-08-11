import { useCallback } from "react";
import { View, Text } from "react-native";
import * as Icons from "lucide-react-native";
import { aiAPI, analyticsAPI, rewardsAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { sats, titleCase, usd } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Badge, CategorySpend } from "@/lib/types";
import { Button, Card, COLORS, ErrorNote, Header, Label, Loading, Num, Screen } from "@/components/ui";
import { font, fontSize, iconSize } from "@/lib/theme";

export default function Profile() {
  const { user, signOut } = useAuth();

  const state = useApi(
    useCallback(async () => {
      const [summary, persona, spending] = await Promise.all([
        rewardsAPI.summary(), aiAPI.persona(), analyticsAPI.spending("all"),
      ]);
      return { summary, persona, spending };
    }, []),
  );

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Profile" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const { summary, persona, spending } = state.data;
  const lvl = summary.level;

  return (
    <Screen>
      <Header back title="Profile" />

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.elevated, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.primary, fontSize: fontSize.heading, fontFamily: font.medium }}>
            {(user?.display_name ?? "?")[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ marginLeft: 14 }}>
          <Text style={{ color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium }}>{user?.display_name}</Text>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 }}>{user?.email}</Text>
        </View>
      </View>

      <Card style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: COLORS.text, fontSize: fontSize.heading, fontFamily: font.medium }}>{lvl.name}</Text>
          <View style={{ backgroundColor: COLORS.accentSurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: COLORS.primary, fontSize: fontSize.caption, fontFamily: font.mono }}>{lvl.multiplier}x</Text>
          </View>
        </View>
        <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 14, overflow: "hidden" }}>
          <View style={{ width: `${lvl.progress * 100}%`, height: 4, backgroundColor: COLORS.primary }} />
        </View>
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8 }}>
          {lvl.next_level ? `${sats(lvl.sats_to_next)} sats to ${lvl.next_level}` : "Top level reached"}
        </Text>
      </Card>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
        <Tile label="Current streak" value={`${summary.streak.current}`} />
        <Tile label="Best streak" value={`${summary.streak.longest}`} />
        <Tile label="Transactions" value={`${summary.transaction_count}`} />
      </View>

      {persona.has_enough_data && (
        <Card style={{ marginBottom: 24 }}>
          <Label>Spending persona</Label>
          <Text style={{ color: COLORS.text, fontSize: fontSize.heading, fontFamily: font.medium, marginTop: 8 }}>
            {persona.persona.name}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 6, lineHeight: 19 }}>{persona.persona.blurb}</Text>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 10 }}>
            {(persona.confidence * 100).toFixed(0)}% confidence
          </Text>
        </Card>
      )}

      <Label>Badges · {summary.badges.earned_count} of {summary.badges.total_count}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 24 }}>
        {summary.badges.all.map((b: Badge) => {
          const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[
            b.icon.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("")
          ] ?? Icons.Award;
          return (
            <View
              key={b.key}
              accessible
              accessibilityLabel={`${b.name}. ${b.description}. ${b.earned ? "Earned" : "Locked"}`}
              style={{
                width: "31%", alignItems: "center", padding: 12, borderRadius: 12,
                backgroundColor: COLORS.card, borderWidth: 1,
                borderColor: b.earned ? COLORS.border : "transparent", opacity: b.earned ? 1 : 0.35,
              }}
            >
              <Icon size={iconSize.lg} color={b.earned ? COLORS.primary : COLORS.muted} />
              <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: fontSize.caption, marginTop: 8, textAlign: "center" }}>{b.name}</Text>
            </View>
          );
        })}
      </View>

      <Label>Where your sats came from</Label>
      <View style={{ marginTop: 12, marginBottom: 24, gap: 10 }}>
        {spending.categories.slice(0, 6).map((c: CategorySpend) => (
          <View key={c.category}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
              <Text style={{ color: COLORS.text, fontSize: fontSize.caption }}>{titleCase(c.category)}</Text>
              <Num size={fontSize.caption} color={COLORS.primary}>{sats(c.sats_earned)}</Num>
            </View>
            <View style={{ height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
              <View style={{ width: `${c.share * 100}%`, height: 3, backgroundColor: COLORS.primary }} />
            </View>
          </View>
        ))}
      </View>

      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12 }}>
      <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>{label}</Text>
      <Num size={fontSize.heading}>{value}</Num>
    </View>
  );
}
