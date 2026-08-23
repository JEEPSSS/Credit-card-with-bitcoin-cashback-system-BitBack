import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, TextInput, View } from "react-native";
import { surveyAPI } from "@/lib/api";
import { useAction } from "@/lib/useApi";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Button, Card, COLORS, Header, Screen } from "@/components/ui";
import { font, fontSize, motion, radius, space, MIN_TOUCH_TARGET } from "@/lib/theme";

/**
 * Chapter 3.6's instrument, one question per card, matching the standalone
 * web page at /survey byte-for-byte in question text so the two channels
 * (in-app and web) are directly comparable in the analysis.
 */
const LIKERT_QUESTIONS = [
  { key: "q1", text: "I am at least somewhat interested in owning or holding Bitcoin." },
  { key: "q2", text: "I would not currently feel confident opening a cryptocurrency exchange account and buying Bitcoin myself." },
  { key: "q3", text: "Earning Bitcoin automatically as cashback, without having to buy it myself, is appealing to me." },
  { key: "q4", text: "I understood what my Bitcoin balance was worth in Singapore dollars at every point in the walkthrough." },
  { key: "q5", text: "The category-based reward rates and boosts made me want to spend more in specific categories to earn more." },
  { key: "q6", text: "Seeing a forecast of next month's earnings would make me check the app more often." },
  { key: "q7", text: "Being shown exactly which transactions were flagged as risky, and why, made me trust the app more than a plain “your card is protected” message would have." },
] as const;

const Q8_OPTIONS = [
  { value: "much_less", label: "Much less appealing" },
  { value: "less", label: "Less appealing" },
  { value: "equally", label: "Equally appealing" },
  { value: "more", label: "More appealing" },
  { value: "much_more", label: "Much more appealing" },
] as const;

type Answers = {
  screen_active_trader: boolean | null;
  q1: number | null; q2: number | null; q3: number | null; q4: number | null;
  q5: number | null; q6: number | null; q7: number | null;
  q8: (typeof Q8_OPTIONS)[number]["value"] | null;
  q9: string; q10: string;
};

const EMPTY: Answers = {
  screen_active_trader: null,
  q1: null, q2: null, q3: null, q4: null, q5: null, q6: null, q7: null,
  q8: null, q9: "", q10: "",
};

const STEPS = ["intro", "screen", ...LIKERT_QUESTIONS.map((q) => q.key), "q8", "q9", "q10", "done"] as const;

function Fade({ trigger, children }: { trigger: unknown; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: motion.base, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return <Animated.View style={{ opacity, flex: 1 }}>{children}</Animated.View>;
}

function Progress({ index, total }: { index: number; total: number }) {
  if (index <= 0 || index >= STEPS.length - 1) return <View style={{ height: space.xl }} />;
  const current = index - 1;
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: space.xl }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1, height: 4, borderRadius: radius.pill,
            backgroundColor: i < current ? COLORS.primary : COLORS.hairline,
          }}
        />
      ))}
    </View>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <Text style={{ color: COLORS.primary, fontFamily: font.medium, fontSize: fontSize.caption,
      textTransform: "uppercase", letterSpacing: 0.5, marginBottom: space.sm }}>
      {children}
    </Text>
  );
}

function Question({ children }: { children: string }) {
  return (
    <Text style={{ color: COLORS.text, fontFamily: font.medium, fontSize: fontSize.heading,
      lineHeight: fontSize.heading * 1.35, marginBottom: space.lg }}>
      {children}
    </Text>
  );
}

function LikertRow({ value, onSelect }: { value: number | null; onSelect: (v: number) => void }) {
  return (
    <View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {[1, 2, 3, 4, 5].map((v) => {
          const selected = value === v;
          return (
            <Pressable
              key={v}
              onPress={() => onSelect(v)}
              accessibilityRole="button"
              accessibilityLabel={`${v} out of 5`}
              style={{
                flex: 1, aspectRatio: 1, minHeight: MIN_TOUCH_TARGET, borderRadius: radius.control,
                borderWidth: 1, borderColor: selected ? COLORS.primary : COLORS.border,
                backgroundColor: selected ? COLORS.primary : COLORS.raised,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: font.mono, fontSize: fontSize.heading,
                color: selected ? COLORS.onPrimary : COLORS.text }}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Strongly disagree</Text>
        <Text style={{ color: COLORS.muted, fontSize: fontSize.caption }}>Strongly agree</Text>
      </View>
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: MIN_TOUCH_TARGET, borderRadius: radius.control, borderWidth: 1,
        borderColor: selected ? COLORS.primary : COLORS.border,
        backgroundColor: selected ? COLORS.accentSurface : COLORS.raised,
        justifyContent: "center", paddingHorizontal: space.lg, marginBottom: space.sm,
      }}
    >
      <Text style={{ color: selected ? COLORS.primary : COLORS.text, fontSize: fontSize.body }}>{label}</Text>
    </Pressable>
  );
}

export default function Survey() {
  const [index, setIndex] = useState(0);
  const [a, setA] = useState<Answers>(EMPTY);
  const submitAction = useAction(surveyAPI.submit);
  const [outcome, setOutcome] = useState<"success" | null>(null);

  const step = STEPS[index];
  const next = () => setIndex((i) => i + 1);

  const doSubmit = async (payload: Answers) => {
    const result = await submitAction.run({
      screen_active_trader: !!payload.screen_active_trader,
      // This screen only exists inside the app, so reaching it already means
      // the respondent has used it -- see the type's own comment.
      has_used_app: true,
      q1: payload.q1, q2: payload.q2, q3: payload.q3, q4: payload.q4,
      q5: payload.q5, q6: payload.q6, q7: payload.q7, q8: payload.q8,
      q9: payload.q9 || null, q10: payload.q10 || null,
    });
    setIndex(STEPS.length - 1);
    if (result) setOutcome("success");
  };

  let body: React.ReactNode;
  if (step === "intro") {
    body = (
      <>
        <Eyebrow>Final Year Project — NTU CCDS</Eyebrow>
        <Text style={{ color: COLORS.text, fontFamily: font.medium, fontSize: fontSize.title, marginBottom: space.sm }}>
          Help validate BitBack
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: fontSize.body, lineHeight: fontSize.body * 1.5, marginBottom: space.xl }}>
          You just used the actual prototype. This short, anonymous survey checks whether the idea landed —
          about two minutes, no account, nothing saved beyond your answers.
        </Text>
        <View style={{ flex: 1 }} />
        <Button label="Start" onPress={next} />
      </>
    );
  } else if (step === "screen") {
    body = (
      <>
        <Eyebrow>First, a quick check</Eyebrow>
        <Question>Do you currently trade cryptocurrency actively or regularly — for example, buying or selling on an exchange at least monthly?</Question>
        <Choice label="No" selected={false} onPress={() => { setA((s) => ({ ...s, screen_active_trader: false })); next(); }} />
        <Choice label="Yes" selected={false} onPress={() => {
          const updated = { ...a, screen_active_trader: true };
          setA(updated);
          void doSubmit(updated);
        }} />
      </>
    );
  } else if (step === "q8") {
    body = (
      <>
        <Eyebrow>Question 8 of 10</Eyebrow>
        <Question>Compared to a points-based cashback card you already have, this app's Bitcoin reward is…</Question>
        {Q8_OPTIONS.map((o) => (
          <Choice key={o.value} label={o.label} selected={a.q8 === o.value}
            onPress={() => { setA((s) => ({ ...s, q8: o.value })); next(); }} />
        ))}
      </>
    );
  } else if (step === "q9" || step === "q10") {
    const n = step === "q9" ? 9 : 10;
    const question = n === 9
      ? "What, if anything, would stop you from switching your everyday spending to a card like this?"
      : "What is the single feature you would want built next?";
    body = (
      <>
        <Eyebrow>{`Question ${n} of 10 · optional`}</Eyebrow>
        <Question>{question}</Question>
        <TextInput
          value={a[step]}
          onChangeText={(t) => setA((s) => ({ ...s, [step]: t }))}
          placeholder="Type as much or as little as you like…"
          placeholderTextColor={COLORS.subtle}
          multiline
          style={{
            flex: 1, minHeight: 120, backgroundColor: COLORS.sunken, borderWidth: 1, borderColor: COLORS.border,
            borderRadius: radius.control, color: COLORS.text, fontSize: fontSize.body, padding: space.md,
            textAlignVertical: "top",
          }}
        />
        <Button
          label={n === 9 ? "Next" : "Submit"}
          onPress={() => (n === 9 ? next() : void doSubmit(a))}
          loading={n === 10 && submitAction.busy}
          style={{ marginTop: space.lg }}
        />
      </>
    );
  } else if (step === "done") {
    const failed = submitAction.error && outcome !== "success";
    body = (
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <View style={{
          width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: COLORS.primary,
          alignItems: "center", justifyContent: "center", marginBottom: space.lg,
        }}>
          <Text style={{ fontFamily: font.mono, fontSize: 22, color: COLORS.primary }}>{"₿"}</Text>
        </View>
        {failed ? (
          <>
            <Text style={{ color: COLORS.text, fontFamily: font.medium, fontSize: fontSize.title, marginBottom: space.sm, textAlign: "center" }}>
              Almost there
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: fontSize.body, textAlign: "center", marginBottom: space.lg }}>
              Your answers are still here — the submission just didn't go through.
            </Text>
            <Button label="Retry" onPress={() => void doSubmit(a)} loading={submitAction.busy} />
          </>
        ) : a.screen_active_trader ? (
          <>
            <Text style={{ color: COLORS.text, fontFamily: font.medium, fontSize: fontSize.title, marginBottom: space.sm, textAlign: "center" }}>
              Thanks for stopping by
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: fontSize.body, textAlign: "center" }}>
              This study is aimed at people curious about Bitcoin but not yet active traders, so we'll leave it there.
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: COLORS.text, fontFamily: font.medium, fontSize: fontSize.title, marginBottom: space.sm, textAlign: "center" }}>
              Recorded — thank you
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: fontSize.body, textAlign: "center" }}>
              Your response just became part of a real Final Year Project evaluation.
            </Text>
          </>
        )}
      </View>
    );
  } else {
    const q = LIKERT_QUESTIONS.find((q) => q.key === step)!;
    body = (
      <>
        <Eyebrow>{`Question ${LIKERT_QUESTIONS.indexOf(q) + 1} of 7`}</Eyebrow>
        <Question>{q.text}</Question>
        <LikertRow value={a[q.key as keyof Answers] as number | null}
          onSelect={(v) => { setA((s) => ({ ...s, [q.key]: v })); next(); }} />
      </>
    );
  }

  return (
    <Screen scroll={false}>
      <Header back title="Product research" />
      <Progress index={index} total={STEPS.length - 2} />
      <Card style={{ flex: 1, padding: space.xl }}>
        <Fade trigger={index}>{body}</Fade>
      </Card>
    </Screen>
  );
}
