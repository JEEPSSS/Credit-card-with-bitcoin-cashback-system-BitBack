import { useCallback } from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { aiAPI } from "@/lib/api";
import { fraudFeature, relativeTime, riskBand, scoredBy, titleCase, usd } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Card, COLORS, Empty, ErrorNote, Header, Label, Loading, Num, Screen } from "@/components/ui";
import { RISK_FLAG_THRESHOLD, font, fontSize } from "@/lib/theme";

export default function Fraud() {
  const state = useApi(
    useCallback(async () => {
      const [summary, flagged] = await Promise.all([aiAPI.fraudSummary(), aiAPI.fraudFlagged()]);
      return { summary, flagged };
    }, []),
  );

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Fraud protection" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const d = state.data;
  const s = d.summary;

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <Header back title="Fraud protection" subtitle="Every transaction is scored against your own spending pattern." />

      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <Gauge value={s.protection_score} />
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 14 }}>Protection score</Text>
        {/* The name alone suggests a measure of how safe the account is. It is
            the share of scored transactions that were not flagged. */}
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 4, textAlign: "center" }}>
          {s.total_transactions_analyzed > 0
            ? `${s.protection_score}% of your scored transactions were not flagged`
            : "No transactions scored yet"}
        </Text>
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
          {d.flagged.map((f) => {
            const band = riskBand(f.risk_score);
            return (
              <Card key={f.transaction_id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium }}>{f.merchant}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 3 }}>
                      {titleCase(f.category)} · {usd(f.amount_fiat)} · {relativeTime(f.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Num size={fontSize.heading} color={band.color}>{f.risk_score}</Num>
                    <Text style={{ color: band.color, fontSize: fontSize.caption }}>{band.label}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 14, gap: 5 }}>
                  {Object.entries(f.features).map(([k, v]) => {
                    const feature = fraudFeature(k, Number(v));
                    return (
                      <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, flex: 1 }}>{feature.label}</Text>
                        <Text style={{ color: COLORS.text, fontSize: fontSize.caption, textAlign: "right", flexShrink: 1 }}>
                          {feature.value}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 10 }}>{scoredBy(f.model_version)}</Text>
              </Card>
            );
          })}
        </View>
      )}

      <Card style={{ marginTop: 24 }}>
        <Text style={{ color: COLORS.text, fontSize: fontSize.caption, fontFamily: font.medium }}>How this works</Text>
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8, lineHeight: 20 }}>
          An Isolation Forest learns what your normal spending looks like across six features, then measures how far
          each new transaction sits from it. From about your 70th purchase the model trains on your own transactions;
          before that a simpler rule set covers the gap. A score of {RISK_FLAG_THRESHOLD} or above marks a transaction
          for review. Tested on simulated cardholders, it caught 96% of planted fraud and about one flag in six was a
          false alarm: a clean score is not a guarantee, and a flag is not proof.
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
      <Num size={fontSize.display} color={color}>{value}</Num>
    </View>
  );
}

function Tile({ label, value, color = COLORS.text }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12 }}>
      <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>{label}</Text>
      <Num size={fontSize.heading} color={color}>{value}</Num>
    </View>
  );
}
