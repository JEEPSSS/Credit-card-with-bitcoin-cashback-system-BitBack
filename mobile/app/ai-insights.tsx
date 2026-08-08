import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import * as Icons from "lucide-react-native";
import { aiAPI } from "@/lib/api";
import { sats, titleCase, usd, pct } from "@/lib/format";
import { Card, COLORS, Header, Label, Loading, Num, Screen } from "@/components/ui";

const MODELS = [
  { name: "Isolation Forest", use: "Fraud detection", lib: "scikit-learn" },
  { name: "Damped Holt's smoothing", use: "Earnings trend", lib: "NumPy" },
  { name: "Linear regression", use: "Baseline forecast", lib: "Pure Python" },
  { name: "Weighted content ranking", use: "Boost recommendation", lib: "NumPy" },
  { name: "Nearest-centroid cosine", use: "Spending persona", lib: "NumPy" },
];

export default function AIInsights() {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    Promise.all([aiAPI.forecast(), aiAPI.fraudSummary(), aiAPI.persona(), aiAPI.boostRecommendation()])
      .then(([forecast, fraud, persona, boost]) => setD({ forecast, fraud, persona, boost }))
      .catch(() => {});
  }, []);

  if (!d) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Header back title="AI insights" subtitle="Five models running on your own spending history." />

      <Card onPress={() => router.push("/fraud")} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icons.ShieldCheck size={16} color={COLORS.success} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" }}>Fraud protection</Text>
          </View>
          <Num size={20} color={COLORS.success}>{d.fraud.protection_score}</Num>
        </View>
        <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
          {d.fraud.total_transactions_analyzed} transactions scored · {d.fraud.high_risk_count} flagged for review
        </Text>
      </Card>

      {d.forecast.has_enough_data && (
        <Card style={{ marginBottom: 12 }}>
          <Label>30-day forecast</Label>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 10 }}>
            <Num size={26} color={COLORS.primary}>{sats(d.forecast.predicted_sats_30d)}</Num>
            <Text style={{ color: COLORS.muted, fontSize: 13 }}>sats</Text>
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
            Range {sats(d.forecast.lower_bound)}–{sats(d.forecast.upper_bound)} · trending {d.forecast.trend_direction}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <ModelBox
              title="Linear regression"
              value={sats(d.forecast.model_comparison.linear_regression.predicted_sats)}
              note={`R² ${d.forecast.model_comparison.linear_regression.r2}`}
            />
            <ModelBox
              title="Damped Holt's"
              value={sats(d.forecast.model_comparison.holt_damped.predicted_sats)}
              note={`α ${d.forecast.model_comparison.holt_damped.alpha} · φ ${d.forecast.model_comparison.holt_damped.phi}`}
            />
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 12, lineHeight: 18 }}>
            Blended 60/40 toward Holt's, which reacts faster to a change in your spending.
          </Text>
        </Card>
      )}

      {d.persona.has_enough_data && (
        <Card style={{ marginBottom: 12 }}>
          <Label>Spending persona</Label>
          <Text style={{ color: COLORS.text, fontSize: 20, fontFamily: "Inter_500Medium", marginTop: 10 }}>
            {d.persona.persona.name}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>{d.persona.persona.blurb}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 12 }}>
            Confidence {(d.persona.confidence * 100).toFixed(0)}% · next closest is {d.persona.runner_up}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {d.persona.top_categories.map((c: any) => (
              <View key={c.category} style={{ backgroundColor: COLORS.elevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: COLORS.text, fontSize: 12 }}>
                  {titleCase(c.category)} {(c.share * 100).toFixed(0)}%
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {d.boost.has_enough_data && (
        <Card onPress={() => router.push("/(tabs)/boosts")} style={{ marginBottom: 24 }}>
          <Label>Recommended boost</Label>
          <Text style={{ color: COLORS.text, fontSize: 18, fontFamily: "Inter_500Medium", marginTop: 10 }}>
            {titleCase(d.boost.top_pick.category)}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
            Score {d.boost.top_pick.score} · about {usd(d.boost.top_pick.predicted_extra_usd)} more each month
          </Text>
        </Card>
      )}

      <Label>Models in this build</Label>
      <View style={{ marginTop: 10, gap: 8 }}>
        {MODELS.map((m) => (
          <View key={m.name} style={{ backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14 }}>
            <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>{m.name}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>{m.use} · {m.lib}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function ModelBox({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.elevated, borderRadius: 8, padding: 12 }}>
      <Text style={{ color: COLORS.muted, fontSize: 11 }}>{title}</Text>
      <Num size={15}>{value}</Num>
      <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>{note}</Text>
    </View>
  );
}
