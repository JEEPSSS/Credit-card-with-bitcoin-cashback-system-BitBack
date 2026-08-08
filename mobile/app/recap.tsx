import { useEffect, useState } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { router } from "expo-router";
import { analyticsAPI } from "@/lib/api";
import { sats, titleCase, usd } from "@/lib/format";
import { Button, COLORS, Empty, Header, Loading, Num, Screen } from "@/components/ui";

const { width } = Dimensions.get("window");

export default function Recap() {
  const [d, setD] = useState<any>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => { analyticsAPI.recap().then(setD).catch(() => {}); }, []);
  if (!d) return <Screen><Loading /></Screen>;
  if (!d.has_data) return <Screen><Header back title="Recap" /><Empty title="Not enough yet" body={d.message} /></Screen>;

  const slides = [
    { label: "You stacked", value: sats(d.total_sats), unit: "sats", note: `Worth ${usd(d.total_usd)} today.` },
    { label: "Across", value: String(d.transaction_count), unit: "transactions", note: `On ${usd(d.total_spent)} of spending.` },
    { label: "Your top category", value: titleCase(d.top_category.category), note: `${sats(d.top_category.sats)} sats from here alone.` },
    { label: "Biggest single reward", value: sats(d.biggest_reward.sats), unit: "sats", note: `At ${d.biggest_reward.merchant}.` },
    { label: "Longest streak", value: String(d.streak), unit: "days", note: "Consecutive days with a transaction." },
    { label: "You beat", value: `${d.percentile}%`, note: "of BitBack users this month." },
    { label: "Put another way", value: d.fun_facts[0], small: true, note: d.fun_facts[2] },
  ];
  const s = slides[slide];
  const last = slide === slides.length - 1;

  return (
    <Screen scroll={false}>
      <Header back title="Your month" subtitle={d.period} />
      <Pressable
        onPress={() => (last ? router.back() : setSlide(slide + 1))}
        accessibilityRole="button"
        accessibilityLabel={last ? "Finish recap" : "Next slide"}
        style={{ flex: 1, justifyContent: "center" }}
      >
        <View style={{ flexDirection: "row", gap: 4, marginBottom: 40 }}>
          {slides.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: i <= slide ? COLORS.primary : COLORS.border }} />
          ))}
        </View>
        <Animated.View key={slide} entering={FadeIn.duration(320)} exiting={FadeOut.duration(120)}>
          <Text style={{ color: COLORS.muted, fontSize: 15 }}>{s.label}</Text>
          <Text
            style={{
              color: COLORS.primary,
              fontSize: s.small ? 24 : 46,
              fontFamily: s.small ? "Inter_500Medium" : "JetBrainsMono_500Medium",
              marginTop: 12,
              lineHeight: s.small ? 34 : 54,
            }}
          >
            {s.value}
          </Text>
          {s.unit ? <Text style={{ color: COLORS.muted, fontSize: 17, marginTop: 4 }}>{s.unit}</Text> : null}
          <Text style={{ color: COLORS.text, fontSize: 15, marginTop: 20, lineHeight: 22 }}>{s.note}</Text>
        </Animated.View>
        <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 48 }}>
          {last ? "Tap to finish" : "Tap to continue"}
        </Text>
      </Pressable>
    </Screen>
  );
}
