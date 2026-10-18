import { useCallback, useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { aiAPI, rewardsAPI } from "@/lib/api";
import { pct, titleCase, usd } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { refreshError } from "@/lib/screenState";
import type { BoostOption } from "@/lib/types";
import { Button, Card, COLORS, ErrorNote, Header, InlineError, Label, Loading, Num, Screen } from "@/components/ui";
import { Flame, Sparkles, iconNamed } from "@/components/icons";
import { CATEGORY_ICON, font, fontSize, iconSize, space } from "@/lib/theme";

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

  // A failure from the last attempt should not greet the next one.
  const ask = (category: string) => {
    activate.setError(null);
    setConfirm(category);
  };

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
    <Screen onRefresh={state.refresh} refreshing={state.refreshing} refreshError={refreshError(state)}>
      <Header title="Boosts" subtitle="Double the cashback in one category for 30 days. One boost at a time." />

      {boosts.active && (
        <Card style={{ marginBottom: 16, borderColor: COLORS.accentBorder }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Flame size={iconSize.sm} color={COLORS.primary} />
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
            <Sparkles size={iconSize.sm} color={COLORS.primary} />
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
              <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Share of boost value</Text>
              <Num size={fontSize.body} color={COLORS.primary}>{`${pick.score}%`}</Num>
            </View>
            <View>
              <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Extra per month</Text>
              <Num size={fontSize.body}>{usd(pick.predicted_extra_usd)}</Num>
            </View>
          </View>
          {boosts.active?.category !== pick.category && (
            <Button label={`Boost ${titleCase(pick.category)}`} onPress={() => ask(pick.category)} style={{ marginTop: 16 }} />
          )}
        </Card>
      )}

      <Label>All categories</Label>
      <View style={{ gap: 8, marginTop: 12 }}>
        {boosts.available.map((c: BoostOption) => {
          const Icon = iconNamed((CATEGORY_ICON as Record<string, string>)[c.category]);
          return (
            <Pressable
              key={c.category}
              onPress={() => ask(c.category)}
              disabled={c.is_active}
              accessibilityRole="button"
              // The visible rates were missing from the spoken name, and the
              // active row looked tappable but did nothing.
              accessibilityLabel={
                `${titleCase(c.category)}: ${pct(c.base_rate, 1)} now, ${pct(c.boosted_rate, 1)} with a boost` +
                (c.is_active ? ". Boost active" : "")
              }
              accessibilityState={{ disabled: c.is_active }}
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
              {/* Before and after, joined by an arrow: two stacked rates told
                  apart only by colour did not say which was which. */}
              <View style={{ alignItems: "flex-end" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  <Num size={fontSize.caption} color={COLORS.muted}>{pct(c.base_rate, 1)}</Num>
                  <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>→</Text>
                  <Num size={fontSize.caption} color={COLORS.primary}>{pct(c.boosted_rate, 1)}</Num>
                </View>
                {c.is_active ? (
                  <Text style={{ color: COLORS.primary, fontSize: fontSize.caption, marginTop: 2 }}>Active</Text>
                ) : null}
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
            <InlineError message={activate.error} />
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
