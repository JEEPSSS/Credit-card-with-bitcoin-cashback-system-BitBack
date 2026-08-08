import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Icons from "lucide-react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { miscAPI, rewardsAPI, transactionAPI } from "@/lib/api";
import { sats, pct, titleCase, usd } from "@/lib/format";
import { Odometer } from "@/components/Odometer";
import { Button, Card, COLORS, Header, Label, Num, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { CATEGORY_ICON, MIN_TOUCH_TARGET } from "@/lib/theme";

const PRESETS = [5, 15, 25, 50, 100];

export default function Simulate() {
  const [categories, setCategories] = useState<any[]>([]);
  const [amount, setAmount] = useState("25");
  const [category, setCategory] = useState("dining");
  const [merchant, setMerchant] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { miscAPI.categories().then(setCategories).catch(() => {}); }, []);

  // Debounced so typing an amount doesn't fire a request per keystroke.
  useEffect(() => {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setPreview(null); return; }
    const t = setTimeout(() => {
      rewardsAPI.preview({ amount_fiat: value, category }).then(setPreview).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [amount, category]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await transactionAPI.create({
        amount_fiat: parseFloat(amount),
        category,
        merchant: merchant.trim() || titleCase(category),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(r);
    } catch (e: any) {
      setError(e.friendlyMessage);
    } finally {
      setBusy(false);
    }
  }

  if (result) return <Result result={result} onDone={() => { setResult(null); setMerchant(""); }} />;

  const valid = parseFloat(amount) > 0;

  return (
    <Screen>
      <Header title="New transaction" subtitle="Simulate a card purchase and see the reward before you commit." />

      <View
        style={{
          flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card,
          borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
          paddingHorizontal: 14, minHeight: 64, marginBottom: 12,
        }}
      >
        <Text style={{ color: COLORS.muted, fontSize: 28, fontFamily: "JetBrainsMono_500Medium" }}>$</Text>
        <TextInput
          accessibilityLabel="Amount in dollars"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#5C5C63"
          style={{
            flex: 1, marginLeft: 6, color: COLORS.text, fontSize: 28,
            fontFamily: "JetBrainsMono_500Medium",
          }}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
        {PRESETS.map((p) => (
          <Pressable
            key={p}
            onPress={() => setAmount(String(p))}
            accessibilityRole="button"
            style={{
              flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center",
              borderRadius: 8, borderWidth: 1,
              borderColor: amount === String(p) ? COLORS.primary : COLORS.border,
              backgroundColor: amount === String(p) ? "#2A1D08" : "transparent",
            }}
          >
            <Text style={{ color: amount === String(p) ? COLORS.primary : COLORS.muted, fontSize: 13, fontFamily: "JetBrainsMono_500Medium" }}>
              ${p}
            </Text>
          </Pressable>
        ))}
      </View>

      <Label>Category</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 20 }}>
        {categories.map((c) => {
          const active = c.category === category;
          const key = (CATEGORY_ICON as any)[c.category] ?? "credit-card";
          const Icon = (Icons as any)[key.split("-").map((p: string) => p[0].toUpperCase() + p.slice(1)).join("")] ?? Icons.CreditCard;
          return (
            <Pressable
              key={c.category}
              onPress={() => setCategory(c.category)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                minHeight: 40, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1,
                borderColor: active ? COLORS.primary : COLORS.border,
                backgroundColor: active ? "#2A1D08" : COLORS.card,
              }}
            >
              <Icon size={14} color={active ? COLORS.primary : COLORS.muted} />
              <Text style={{ color: active ? COLORS.primary : COLORS.text, fontSize: 13 }}>{titleCase(c.category)}</Text>
              <Text style={{ color: COLORS.muted, fontSize: 11, fontFamily: "JetBrainsMono_500Medium" }}>
                {(c.base_rate * 100).toFixed(1)}%
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder={`e.g. ${titleCase(category)} purchase`} />

      {preview && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Card style={{ marginBottom: 16 }}>
            <Label>You'll earn</Label>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <Num size={28} color={COLORS.primary}>{sats(preview.total_sats)}</Num>
              <Text style={{ color: COLORS.muted, fontSize: 13 }}>sats · {usd(preview.usd_value)}</Text>
            </View>
            <View style={{ marginTop: 14, gap: 6 }}>
              <Row label={`Base rate ${pct(preview.cashback_rate, 1)}`} value={`${sats(preview.base_sats)}`} />
              {preview.level_bonus > 0 && <Row label={`Level bonus ${preview.level_multiplier}x`} value={`+${sats(preview.level_bonus)}`} />}
              {preview.boost_bonus > 0 && <Row label={`Boost ${preview.boost_multiplier}x`} value={`+${sats(preview.boost_bonus)}`} />}
              <Row label="Effective rate" value={pct(preview.effective_rate)} accent />
            </View>
          </Card>
        </Animated.View>
      )}

      <Button label="Confirm transaction" onPress={submit} loading={busy} disabled={!valid} />
      {error ? <Card style={{ marginTop: 16, borderColor: "#4A2020" }}><Text style={{ color: COLORS.text, fontSize: 14 }}>{error}</Text></Card> : null}
    </Screen>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: COLORS.muted, fontSize: 13 }}>{label}</Text>
      <Num size={13} color={accent ? COLORS.primary : COLORS.text}>{value}</Num>
    </View>
  );
}

/** Confirmation is the reward moment, so the odometer runs here too. */
function Result({ result, onDone }: { result: any; onDone: () => void }) {
  const r = result.reward;
  return (
    <Screen>
      <View style={{ paddingTop: 64, alignItems: "center" }}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={{ color: COLORS.muted, fontSize: 14, textAlign: "center" }}>Earned</Text>
          <View style={{ alignItems: "center", marginTop: 12 }}>
            <Odometer value={r.total_sats} fontSize={46} color={COLORS.primary} suffix="sats" />
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 14, textAlign: "center", marginTop: 10 }}>
            {result.transaction.merchant} · {usd(result.transaction.amount_fiat)} at {pct(r.effective_rate)} back
          </Text>
        </Animated.View>
      </View>

      <View style={{ marginTop: 40, gap: 12 }}>
        {result.round_up && (
          <Card>
            <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>Round-up added</Text>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
              {usd(result.round_up.spare_usd)} of spare change converted to {sats(result.round_up.sats)} sats.
            </Text>
          </Card>
        )}
        {result.new_badges?.map((b: any) => (
          <Card key={b.key}>
            <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>Badge earned: {b.name}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>{b.description}</Text>
          </Card>
        ))}
        {result.risk?.is_anomaly && (
          <Card style={{ borderColor: "#4A2020" }}>
            <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>Flagged for review</Text>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
              This scored {result.risk.score} out of 100 against your normal spending. Check it in fraud protection if it wasn't you.
            </Text>
          </Card>
        )}
        <Card>
          <Text style={{ color: COLORS.muted, fontSize: 13 }}>New balance</Text>
          <Num size={22}>{sats(result.wallet_balance_sats)} sats</Num>
        </Card>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
        <Button label="Another" variant="ghost" onPress={onDone} style={{ flex: 1 }} />
        <Button label="Done" onPress={() => { onDone(); router.push("/(tabs)"); }} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}
