import { useCallback, useState } from "react";
import { View, Text, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { miscAPI } from "@/lib/api";
import { sats } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Button, Card, COLORS, ErrorNote, Header, Label, Loading, Num, Screen } from "@/components/ui";
import { font, fontSize } from "@/lib/theme";

const COPIED_FEEDBACK_MS = 1500;

export default function Referral() {
  const [copied, setCopied] = useState(false);

  const state = useApi(
    useCallback(async () => {
      const [mine, board] = await Promise.all([miscAPI.referral(), miscAPI.leaderboard()]);
      return { mine, board };
    }, []),
  );

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Referrals" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const d = state.data;

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <Header back title="Referrals" subtitle={`You earn ${sats(d.mine.referrer_bonus)} sats per signup. They get ${sats(d.mine.welcome_bonus)}.`} />
      <Card style={{ alignItems: "center", paddingVertical: 28, marginBottom: 20 }}>
        <Label>Your code</Label>
        <Text style={{ color: COLORS.primary, fontSize: fontSize.display, fontFamily: font.mono, letterSpacing: 4, marginTop: 12 }}>
          {d.mine.code}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 20, alignSelf: "stretch" }}>
          <Button
            label={copied ? "Copied" : "Copy"}
            variant="secondary"
            style={{ flex: 1 }}
            onPress={async () => {
              await Clipboard.setStringAsync(d.mine.code);
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
            }}
          />
          <Button
            label="Share"
            style={{ flex: 1 }}
            onPress={() => Share.share({ message: `Join me on BitBack and earn bitcoin on everything you buy. Use code ${d.mine.code}.` })}
          />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
        <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14 }}>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Signups</Text>
          <Num size={fontSize.heading}>{d.mine.total_referrals}</Num>
        </View>
        <View style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14 }}>
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Sats earned</Text>
          <Num size={fontSize.heading} color={COLORS.primary}>{sats(d.mine.total_sats_earned)}</Num>
        </View>
      </View>

      <Label>Top referrers</Label>
      <View style={{ marginTop: 12, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
        {d.board.length === 0 ? (
          <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, padding: 16 }}>No referrals yet. Be the first.</Text>
        ) : (
          d.board.map((r: any, i: number) => (
            <View
              key={r.rank}
              style={{
                flexDirection: "row", alignItems: "center", padding: 14,
                borderBottomWidth: i === d.board.length - 1 ? 0 : 1, borderBottomColor: COLORS.border,
              }}
            >
              <Num size={fontSize.caption} color={COLORS.muted}>{r.rank}</Num>
              <Text style={{ color: COLORS.text, fontSize: fontSize.caption, flex: 1, marginLeft: 14 }}>{r.display_name}</Text>
              <Num size={fontSize.caption} color={COLORS.primary}>{r.total_referrals}</Num>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
