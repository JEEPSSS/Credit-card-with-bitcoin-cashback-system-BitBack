import { useCallback, useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import * as Icons from "lucide-react-native";
import { aiAPI, rewardsAPI } from "@/lib/api";
import { pct, titleCase, usd } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { BoostOption } from "@/lib/types";
import { Button, Card, COLORS, ErrorNote, Header, Label, Loading, Num, Screen } from "@/components/ui";
import { CATEGORY_ICON, font, fontSize, iconSize } from "@/lib/theme";

export default function Boosts() {
  const [confirm, setConfirm] = useState<string | null>(null);

  const state = useApi(
    useCallback(async () => {
      const [boosts, rec] = await Promise.all([rewardsAPI.boosts(), aiAPI.boostRecommendation()]);
      return { boosts, rec };
    }, []),
  );

  const activate = useAction(async (category: string) => {
    await rewardsAPI.activate(category);
    await state.reload();
    setConfirm(null);
  });

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header title="Boosts" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const { boosts, rec } = state.data;
  const pick = rec.has_enough_data ? rec.top_pick : null;

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <Header title="Boosts" subtitle="Double the cashback in one category for 30 days. One boost at a time." />

      {boosts.active && (
        <Card style={{ marginBottom: 16, borderColor: COLORS.accentBorder }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icons.Flame size={iconSize.sm} color={COLORS.primary} />
            <Text style={{ color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium }}>
              {titleCase(boosts.active.category)} at {boosts.active.multiplier}x
            </Text>
          </View>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8 }}>
            {boosts.active.days_remaining} days remaining. Activating another replaces it.
          </Text>
        </Card>
      )}

      {pick && (
        <Card style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icons.Sparkles size={iconSize.sm} color={COLORS.primary} />
            <Label>Recommended for you</Label>
          </View>
          <Text style={{ color: COLORS.text, fontSize: fontSize.heading, fontFamily: font.medium, marginTop: 10 }}>
            {titleCase(pick.category)}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8, lineHeight: 20 }}>
            {pick.explanation}
          </Text>
          <View style={{ flexDirection: "row", gap: 20, marginTop: 14 }}>
            <View>
              <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Match score</Text>
              <Num size={fontSize.body} color={COLORS.primary}>{pick.score}</Num>
            </View>
            <View>
              <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Extra per month</Text>
              <Num size={fontSize.body}>{usd(pick.predicted_extra_usd)}</Num>
            </View>
          </View>
          {boosts.active?.category !== pick.category && (
            <Button label={`Boost ${titleCase(pick.category)}`} onPress={() => setConfirm(pick.category)} style={{ marginTop: 16 }} />
          )}
        </Card>
      )}

      <Label>All categories</Label>
      <View style={{ gap: 8, marginTop: 12 }}>
        {boosts.available.map((c: BoostOption) => {
          const key = (CATEGORY_ICON as Record<string, string>)[c.category] ?? "credit-card";
          const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[
            key.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("")
          ] ?? Icons.CreditCard;
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
              <Icon size={iconSize.md} color={c.is_active ? COLORS.primary : COLORS.muted} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontSize: fontSize.body }}>{titleCase(c.category)}</Text>
                <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 }}>{c.description}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Num size={fontSize.caption} color={COLORS.muted}>{pct(c.base_rate, 1)}</Num>
                <Num size={fontSize.caption} color={COLORS.primary}>{pct(c.boosted_rate, 1)}</Num>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Modal transparent visible={!!confirm} animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 }}>
            <Text style={{ color: COLORS.text, fontSize: fontSize.heading, fontFamily: font.medium }}>
              Boost {titleCase(confirm ?? "")}?
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 10, lineHeight: 20 }}>
              You&apos;ll earn double sats in this category for 30 days.
              {boosts.active ? ` This replaces your ${boosts.active.category} boost.` : ""}
            </Text>
            {activate.error ? (
              <Text style={{ color: COLORS.danger, fontSize: fontSize.caption, marginTop: 12 }}>
                {activate.error}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Button label="Cancel" variant="ghost" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
              <Button
                label="Activate"
                onPress={() => void activate.run(confirm!)}
                loading={activate.busy}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
