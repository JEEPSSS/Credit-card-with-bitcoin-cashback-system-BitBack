import { ReactNode, useCallback, useState } from "react";
import { Alert, View, Text, Modal } from "react-native";
import { goalsAPI, walletAPI } from "@/lib/api";
import { sats } from "@/lib/format";
import type { Goal } from "@/lib/types";
import { useAction, useApi } from "@/lib/useApi";
import { Button, Card, COLORS, Empty, ErrorNote, Header, InlineError, Loading, Num, Screen } from "@/components/ui";
import { Field } from "@/components/Field";
import { font, fontSize } from "@/lib/theme";

export default function Goals() {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [allocating, setAllocating] = useState<Goal | null>(null);
  const [amount, setAmount] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);

  const state = useApi(
    useCallback(async () => {
      const [goals, wallet] = await Promise.all([goalsAPI.list(), walletAPI.balance()]);
      return { goals, wallet };
    }, []),
  );

  const load = state.reload;

  const createGoal = useAction(async () => {
    await goalsAPI.create({ name, target_sats: Number(target) });
    setCreating(false);
    setName("");
    setTarget("");
    await load();
  });

  const allocate = useAction(async (goal: Goal, sats_: number) => {
    await goalsAPI.allocate(goal.id, sats_);
    setAllocating(null);
    await load();
  });

  const removeGoal = useAction(async (id: number) => {
    await goalsAPI.remove(id);
    await load();
  });

  /** Deleting used to happen on the first tap, with no way back. */
  function confirmRemove(g: Goal) {
    Alert.alert(
      `Delete "${g.name}"?`,
      g.current_sats > 0
        ? `The ${sats(g.current_sats)} sats in it go back to your wallet.`
        : "It has no sats in it yet.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setRemoving(g.id);
            void removeGoal.run(g.id);
          },
        },
      ],
    );
  }

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Savings goals" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const d = state.data;

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <Header back title="Savings goals" subtitle={`${sats(d.wallet.balance_sats)} sats available to allocate.`} />
      <Button label="New goal" onPress={() => setCreating(true)} style={{ marginBottom: 20 }} />
      <InlineError message={removeGoal.error} style={{ marginTop: 0, marginBottom: 12 }} />

      {d.goals.length === 0 ? (
        <Empty title="No goals yet" body="Set a target and move sats towards it as you earn." />
      ) : (
        <View style={{ gap: 12 }}>
          {d.goals.map((g) => (
            <Card key={g.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: COLORS.text, fontSize: fontSize.body, fontFamily: font.medium }}>{g.name}</Text>
                <Num size={fontSize.caption} color={COLORS.muted}>{(g.progress * 100).toFixed(0)}%</Num>
              </View>
              <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                <View style={{ width: `${g.progress * 100}%`, height: 4, backgroundColor: g.is_completed ? COLORS.success : COLORS.primary }} />
              </View>
              <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 8, fontFamily: font.mono }}>
                {sats(g.current_sats)} / {sats(g.target_sats)} sats
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                {!g.is_completed && (
                  <Button label="Add sats" variant="secondary" onPress={() => { setAllocating(g); setAmount(""); }} style={{ flex: 1 }} />
                )}
                <Button
                  label="Delete"
                  variant="ghost"
                  loading={removeGoal.busy && removing === g.id}
                  onPress={() => confirmRemove(g)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <Sheet visible={creating} onClose={() => setCreating(false)} title="New goal">
        <Field label="Name" value={name} onChangeText={setName} placeholder="Hardware wallet" />
        <Field label="Target in sats" value={target} onChangeText={setTarget} keyboardType="number-pad" mono placeholder="250000" />
        <InlineError message={createGoal.error} style={{ marginTop: 0, marginBottom: 12 }} />
        <Button
          label="Create goal"
          disabled={!name || !Number(target)}
          loading={createGoal.busy}
          onPress={() => void createGoal.run()}
        />
      </Sheet>

      <Sheet visible={!!allocating} onClose={() => setAllocating(null)} title={`Add to ${allocating?.name ?? ""}`}>
        <Field
          label="Sats"
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          mono
          placeholder="10000"
          hint={`${sats(d.wallet.balance_sats)} available`}
        />
        <InlineError message={allocate.error} style={{ marginTop: 0, marginBottom: 12 }} />
        <Button
          label="Allocate"
          disabled={!Number(amount)}
          loading={allocate.busy}
          onPress={() => allocating && void allocate.run(allocating, Number(amount))}
        />
      </Sheet>
    </Screen>
  );
}

export function Sheet({
  visible, onClose, title, children,
}: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 }}>
          <Text style={{ color: COLORS.text, fontSize: fontSize.heading, fontFamily: font.medium, marginBottom: 20 }}>{title}</Text>
          {children}
          <Button label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
        </View>
      </View>
    </Modal>
  );
}
