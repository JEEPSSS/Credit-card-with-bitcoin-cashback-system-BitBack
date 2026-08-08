import { useCallback, useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Icons from "lucide-react-native";
import { aiAPI, rewardsAPI } from "@/lib/api";
import { pct, titleCase, usd } from "@/lib/format";
import { Button, Card, COLORS, Header, Label, Loading, Num, Screen } from "@/components/ui";
import { CATEGORY_ICON } from "@/lib/theme";

export default function Boosts() {
  const [data, setData] = useState<any>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [boosts, rec] = await Promise.all([rewardsAPI.boosts(), aiAPI.boostRecommendation()]);
    setData({ boosts, rec });
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  async function activate(category: string) {
    setBusy(true);
    try {
      await rewardsAPI.activate(category);
      await load();
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Screen><Loading /></Screen>;
  const { boosts, rec } = data;
  const pick = rec.has_enough_data ? rec.top_pick : null;

  return (
    <Screen onRefresh={load}>
      <Header title="Boosts" subtitle="Double the cashback in one category for 30 days. One boost at a time." />

      {boosts.active && (
        <Card style={{ marginBottom: 16, borderColor: "#4A3410" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icons.Flame size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" }}>
              {titleCase(boosts.active.category)} at {boosts.active.multiplier}x
            </Text>
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8 }}>
            {boosts.active.days_remaining} days remaining. Activating another replaces it.
          </Text>
        </Card>
      )}

      {pick && (
        <Card style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icons.Sparkles size={15} color={COLORS.primary} />
            <Label>Recommended for you</Label>
          </View>
          <Text style={{ color: COLORS.text, fontSize: 18, fontFamily: "Inter_500Medium", marginTop: 10 }}>
            {titleCase(pick.category)}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 20 }}>
            {pick.explanation}
          </Text>
          <View style={{ flexDirection: "row", gap: 20, marginTop: 14 }}>
            <View>
              <Text style={{ color: COLORS.muted, fontSize: 11 }}>Match score</Text>
              <Num size={16} color={COLORS.primary}>{pick.score}</Num>
            </View>
            <View>
              <Text style={{ color: COLORS.muted, fontSize: 11 }}>Extra per month</Text>
              <Num size={16}>{usd(pick.predicted_extra_usd)}</Num>
            </View>
          </View>
          {boosts.active?.category !== pick.category && (
            <Button label={`Boost ${titleCase(pick.category)}`} onPress={() => setConfirm(pick.category)} style={{ marginTop: 16 }} />
          )}
        </Card>
      )}

      <Label>All categories</Label>
      <View style={{ gap: 8, marginTop: 12 }}>
        {boosts.available.map((c: any) => {
          const key = (CATEGORY_ICON as any)[c.category] ?? "credit-card";
          const Icon = (Icons as any)[key.split("-").map((p: string) => p[0].toUpperCase() + p.slice(1)).join("")] ?? Icons.CreditCard;
          return (
            <Pressable
              key={c.category}
              onPress={() => !c.is_active && setConfirm(c.category)}
              accessibilityRole="button"
              accessibilityLabel={`Boost ${c.category}`}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12,
                backgroundColor: COLORS.card, borderWidth: 1,
                borderColor: c.is_active ? COLORS.primary : COLORS.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon size={18} color={c.is_active ? COLORS.primary : COLORS.muted} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontSize: 15 }}>{titleCase(c.category)}</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{c.description}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Num size={13} color={COLORS.muted}>{pct(c.base_rate, 1)}</Num>
                <Num size={13} color={COLORS.primary}>{pct(c.boosted_rate, 1)}</Num>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Modal transparent visible={!!confirm} animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 }}>
            <Text style={{ color: COLORS.text, fontSize: 18, fontFamily: "Inter_500Medium" }}>
              Boost {titleCase(confirm ?? "")}?
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 14, marginTop: 10, lineHeight: 20 }}>
              You'll earn double sats in this category for 30 days.
              {boosts.active ? ` This replaces your ${boosts.active.category} boost.` : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Button label="Cancel" variant="ghost" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
              <Button label="Activate" onPress={() => activate(confirm!)} loading={busy} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
