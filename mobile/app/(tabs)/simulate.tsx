import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Icons from "lucide-react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { miscAPI, newIdempotencyKey, rewardsAPI, transactionAPI } from "@/lib/api";
import { pct, sats, titleCase, usd } from "@/lib/format";
import {
  CATEGORY_ICON, COLORS, MIN_CONTROL_HEIGHT, font, fontSize, iconSize, radius, space,
} from "@/lib/theme";
import type { Category, RewardBreakdown, TransactionResult } from "@/lib/types";
import { useAction, useApi } from "@/lib/useApi";
import { Odometer } from "@/components/Odometer";
import { Field } from "@/components/Field";
import { Async, Button, Card, ErrorNote, Header, Label, Num, Screen } from "@/components/ui";

const PRESETS = [5, 15, 25, 50, 100];
const PREVIEW_DEBOUNCE_MS = 300;
const AMOUNT_FIELD_HEIGHT = 64;

function iconFor(category: string) {
  const key = (CATEGORY_ICON as Record<string, string>)[category] ?? "credit-card";
  const pascal = key.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  return (Icons as unknown as Record<string, Icons.LucideIcon>)[pascal] ?? Icons.CreditCard;
}

export default function Simulate() {
  const [amount, setAmount] = useState("25");
  const [category, setCategory] = useState("dining");
  const [merchant, setMerchant] = useState("");
  const [preview, setPreview] = useState<RewardBreakdown | null>(null);
  const [result, setResult] = useState<TransactionResult | null>(null);

  const categories = useApi(useCallback(() => miscAPI.categories(), []));

  /**
   * One key per intended transaction. Retrying a failed submit reuses it, so
   * the backend recognises the retry and does not pay twice; changing any field
   * starts a new one, because that is a different transaction.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  useEffect(() => {
    setIdempotencyKey(newIdempotencyKey());
  }, [amount, category, merchant]);

  const value = parseFloat(amount);
  const valid = value > 0;

  // Debounced so typing an amount doesn't fire a request per keystroke.
  useEffect(() => {
    if (!valid) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      rewardsAPI
        .preview({ amount_fiat: value, category })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, valid, category]);

  const submit = useAction(async () => {
    const created = await transactionAPI.create(
      { amount_fiat: value, category, merchant: merchant.trim() || titleCase(category) },
      idempotencyKey,
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setResult(created);
  });

  if (result) {
    return (
      <Result
        result={result}
        onDone={() => {
          setResult(null);
          setMerchant("");
          setIdempotencyKey(newIdempotencyKey());
        }}
      />
    );
  }

  return (
    <Screen>
      <Header
        title="New transaction"
        subtitle="Simulate a card purchase and see the reward before you commit."
      />

      <View style={styles.amountField}>
        <Text style={styles.currency}>$</Text>
        <TextInput
          accessibilityLabel="Amount in dollars"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={COLORS.placeholder}
          style={styles.amountInput}
        />
      </View>

      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const active = amount === String(p);
          return (
            <Pressable
              key={p}
              onPress={() => setAmount(String(p))}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.preset,
                {
                  borderColor: active ? COLORS.primary : COLORS.border,
                  backgroundColor: active ? COLORS.accentSurface : "transparent",
                },
              ]}
            >
              <Num size={fontSize.caption} color={active ? COLORS.primary : COLORS.muted}>
                ${p}
              </Num>
            </Pressable>
          );
        })}
      </View>

      <Label>Category</Label>
      <Async state={categories}>
        {(list: Category[]) => (
          <View style={styles.categories}>
            {list.map((c) => {
              const active = c.category === category;
              const Icon = iconFor(c.category);
              return (
                <Pressable
                  key={c.category}
                  onPress={() => setCategory(c.category)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.category,
                    {
                      borderColor: active ? COLORS.primary : COLORS.border,
                      backgroundColor: active ? COLORS.accentSurface : COLORS.card,
                    },
                  ]}
                >
                  <Icon size={iconSize.xs} color={active ? COLORS.primary : COLORS.muted} />
                  <Text
                    style={{
                      color: active ? COLORS.primary : COLORS.text,
                      fontSize: fontSize.caption,
                    }}
                  >
                    {titleCase(c.category)}
                  </Text>
                  <Num size={fontSize.caption} color={COLORS.muted}>
                    {(c.base_rate * 100).toFixed(1)}%
                  </Num>
                </Pressable>
              );
            })}
          </View>
        )}
      </Async>

      <Field
        label="Merchant"
        value={merchant}
        onChangeText={setMerchant}
        placeholder={`e.g. ${titleCase(category)} purchase`}
      />

      {preview && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Card style={{ marginBottom: space.lg }}>
            <Label>You&apos;ll earn</Label>
            <View style={styles.previewHead}>
              <Num size={fontSize.title} color={COLORS.primary}>{sats(preview.total_sats)}</Num>
              <Text style={styles.previewUnit}>sats · {usd(preview.usd_value)}</Text>
            </View>
            <View style={{ marginTop: space.md + 2, gap: space.xs + 2 }}>
              <Row
                label={`Base rate ${pct(preview.cashback_rate, 1)}`}
                value={sats(preview.base_sats)}
              />
              {preview.level_bonus > 0 && (
                <Row
                  label={`Level bonus ${preview.level_multiplier}x`}
                  value={`+${sats(preview.level_bonus)}`}
                />
              )}
              {preview.boost_bonus > 0 && (
                <Row
                  label={`Boost ${preview.boost_multiplier}x`}
                  value={`+${sats(preview.boost_bonus)}`}
                />
              )}
              <Row label="Effective rate" value={pct(preview.effective_rate)} accent />
            </View>
          </Card>
        </Animated.View>
      )}

      <Button
        label="Confirm transaction"
        onPress={() => void submit.run()}
        loading={submit.busy}
        disabled={!valid}
      />
      {submit.error ? (
        <View style={{ marginTop: space.lg }}>
          <ErrorNote message={submit.error} onRetry={() => void submit.run()} />
        </View>
      ) : null}
    </Screen>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Num size={fontSize.caption} color={accent ? COLORS.primary : COLORS.text}>{value}</Num>
    </View>
  );
}

/** Confirmation is the reward moment, so the odometer runs here too. */
function Result({ result, onDone }: { result: TransactionResult; onDone: () => void }) {
  const r = result.reward;
  return (
    <Screen>
      <View style={styles.resultHead}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={styles.resultCaption}>Earned</Text>
          <View style={{ alignItems: "center", marginTop: space.md }}>
            <Odometer
              value={r.total_sats}
              fontSize={fontSize.display}
              color={COLORS.primary}
              suffix="sats"
            />
          </View>
          <Text style={[styles.resultCaption, { marginTop: space.sm + 2 }]}>
            {result.transaction.merchant} · {usd(result.transaction.amount_fiat)} at{" "}
            {pct(r.effective_rate)} back
          </Text>
        </Animated.View>
      </View>

      <View style={{ marginTop: 40, gap: space.md }}>
        {result.round_up && (
          <Card>
            <Text style={styles.resultCardTitle}>Round-up added</Text>
            <Text style={styles.resultCardBody}>
              {usd(result.round_up.spare_usd)} of spare change converted to{" "}
              {sats(result.round_up.sats)} sats.
            </Text>
          </Card>
        )}
        {result.new_badges?.map((b) => (
          <Card key={b.key}>
            <Text style={styles.resultCardTitle}>Badge earned: {b.name}</Text>
            <Text style={styles.resultCardBody}>{b.description}</Text>
          </Card>
        ))}
        {result.risk?.is_anomaly && (
          <Card tone="danger">
            <Text style={styles.resultCardTitle}>Flagged for review</Text>
            <Text style={styles.resultCardBody}>
              This scored {result.risk.score} out of 100 against your normal spending. Check it in
              fraud protection if it wasn&apos;t you.
            </Text>
          </Card>
        )}
        <Card>
          <Text style={styles.resultCardBody}>New balance</Text>
          <Num size={fontSize.heading}>{sats(result.wallet_balance_sats)} sats</Num>
        </Card>
      </View>

      <View style={styles.resultActions}>
        <Button label="Another" variant="ghost" onPress={onDone} style={{ flex: 1 }} />
        <Button
          label="Done"
          onPress={() => {
            onDone();
            router.push("/(tabs)");
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: radius.control,
    paddingHorizontal: space.md + 2,
    minHeight: AMOUNT_FIELD_HEIGHT,
    marginBottom: space.md,
  },
  currency: { color: COLORS.muted, fontSize: fontSize.title, fontFamily: font.mono },
  amountInput: {
    flex: 1,
    marginLeft: space.xs + 2,
    color: COLORS.text,
    fontSize: fontSize.title,
    fontFamily: font.mono,
  },
  presets: { flexDirection: "row", gap: space.sm, marginBottom: space.xl },
  preset: {
    flex: 1,
    minHeight: MIN_CONTROL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
  },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.sm + 2,
    marginBottom: space.xl - space.xs,
  },
  category: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    minHeight: MIN_CONTROL_HEIGHT,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  previewHead: { flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.sm },
  previewUnit: { color: COLORS.muted, fontSize: fontSize.caption },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: COLORS.muted, fontSize: fontSize.caption },
  resultHead: { paddingTop: 64, alignItems: "center" },
  resultCaption: { color: COLORS.muted, fontSize: fontSize.caption, textAlign: "center" },
  resultCardTitle: { color: COLORS.text, fontSize: fontSize.caption, fontFamily: font.medium },
  resultCardBody: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    marginTop: space.xs + 2,
    lineHeight: 19,
  },
  resultActions: { flexDirection: "row", gap: space.sm + 2, marginTop: space.xl },
});
