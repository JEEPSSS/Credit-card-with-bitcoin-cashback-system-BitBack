import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { aiAPI } from "@/lib/api";
import { relativeTime, riskBand, sats, titleCase, usd } from "@/lib/format";
import { Card, COLORS, Empty, Header, Label, Loading, Num, Screen } from "@/components/ui";

const FEATURE_LABELS: Record<string, string> = {
  amount_zscore: "Amount vs your average for this category",
  category_frequency: "How often you use this category",
  time_since_last_tx: "Gap since your last transaction",
  hour_of_day: "Time of day",
  amount_vs_global_avg: "Amount vs your overall average",
  merchant_is_new: "First time at this merchant",
};

export default function Fraud() {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    Promise.all([aiAPI.fraudSummary(), aiAPI.fraudFlagged()])
      .then(([summary, flagged]) => setD({ summary, flagged }))
      .catch(() => {});
  }, []);

  if (!d) return <Screen><Loading /></Screen>;
  const s = d.summary;

  return (
    <Screen>
      <Header back title="Fraud protection" subtitle="Every transaction is scored against your own spending pattern." />

      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <Gauge value={s.protection_score} />
        <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 14 }}>Protection score</Text>
      </Card>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Tile label="Scanned" value={s.total_transactions_analyzed} />
        <Tile label="High" value={s.high_risk_count} color={COLORS.danger} />
        <Tile label="Medium" value={s.medium_risk_count} color={COLORS.primary} />
        <Tile label="Low" value={s.low_risk_count} color={COLORS.success} />
      </View>

      <View style={{ marginTop: 28 }}>
        <Label>Flagged transactions</Label>
      </View>
      {d.flagged.length === 0 ? (
        <Empty title="Nothing flagged" body="No transaction has scored above the review threshold." />
      ) : (
        <View style={{ gap: 10, marginTop: 12 }}>
          {d.flagged.map((f: any) => {
            const band = riskBand(f.risk_score);
            return (
              <Card key={f.transaction_id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" }}>{f.merchant}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 3 }}>
                      {titleCase(f.category)} · {usd(f.amount_fiat)} · {relativeTime(f.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Num size={20} color={band.color}>{f.risk_score}</Num>
                    <Text style={{ color: band.color, fontSize: 11 }}>{band.label}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 14, gap: 5 }}>
                  {Object.entries(f.features).map(([k, v]) => (
                    <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: COLORS.muted, fontSize: 12, flex: 1 }}>{FEATURE_LABELS[k] ?? k}</Text>
                      <Num size={12} color={COLORS.muted}>{typeof v === "number" ? v.toFixed(2) : String(v)}</Num>
                    </View>
                  ))}
                </View>
                <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 10 }}>{f.model_version}</Text>
              </Card>
            );
          })}
        </View>
      )}

      <Card style={{ marginTop: 24 }}>
        <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>How this works</Text>
        <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 20 }}>
          An Isolation Forest learns what your normal spending looks like across six features, then measures how far
          each new transaction sits from it. Once you have enough history the model trains on your own transactions;
          before that a simpler rule set covers the gap. A score of 60 or above marks a transaction for review.
        </Text>
      </Card>
    </Screen>
  );
}

function Gauge({ value }: { value: number }) {
  const size = 130, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const color = value >= 90 ? COLORS.success : value >= 70 ? COLORS.primary : COLORS.danger;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Num size={34} color={color}>{value}</Num>
    </View>
  );
}

function Tile({ label, value, color = COLORS.text }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12 }}>
      <Text style={{ color: COLORS.muted, fontSize: 11 }}>{label}</Text>
      <Num size={18} color={color}>{value}</Num>
    </View>
  );
}
