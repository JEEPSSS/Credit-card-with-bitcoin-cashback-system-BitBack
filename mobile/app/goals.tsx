import { useCallback, useState } from "react";
import { View, Text, Modal } from "react-native";
import { useFocusEffect } from "expo-router";
import { goalsAPI, walletAPI } from "@/lib/api";
import { sats } from "@/lib/format";
import { Button, Card, COLORS, Empty, Header, Loading, Num, Screen } from "@/components/ui";
import { Field } from "@/components/Field";

export default function Goals() {
  const [d, setD] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [allocating, setAllocating] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [goals, wallet] = await Promise.all([goalsAPI.list(), walletAPI.balance()]);
    setD({ goals, wallet });
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));
  if (!d) return <Screen><Loading /></Screen>;

  return (
    <Screen onRefresh={load}>
      <Header back title="Savings goals" subtitle={`${sats(d.wallet.balance_sats)} sats available to allocate.`} />
      <Button label="New goal" onPress={() => setCreating(true)} style={{ marginBottom: 20 }} />

      {d.goals.length === 0 ? (
        <Empty title="No goals yet" body="Set a target and move sats towards it as you earn." />
      ) : (
        <View style={{ gap: 12 }}>
          {d.goals.map((g: any) => (
            <Card key={g.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: COLORS.text, fontSize: 16, fontFamily: "Inter_500Medium" }}>{g.name}</Text>
                <Num size={13} color={COLORS.muted}>{(g.progress * 100).toFixed(0)}%</Num>
              </View>
              <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                <View style={{ width: `${g.progress * 100}%`, height: 4, backgroundColor: g.is_completed ? COLORS.success : COLORS.primary }} />
              </View>
              <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, fontFamily: "JetBrainsMono_500Medium" }}>
                {sats(g.current_sats)} / {sats(g.target_sats)} sats
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                {!g.is_completed && (
                  <Button label="Add sats" variant="secondary" onPress={() => { setAllocating(g); setAmount(""); }} style={{ flex: 1 }} />
                )}
                <Button
                  label="Delete"
                  variant="ghost"
                  onPress={async () => { await goalsAPI.remove(g.id); load(); }}
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
        <Button
          label="Create goal"
          disabled={!name || !Number(target)}
          onPress={async () => {
            await goalsAPI.create({ name, target_sats: Number(target) });
            setCreating(false); setName(""); setTarget(""); load();
          }}
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
        {error ? <Text style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
        <Button
          label="Allocate"
          disabled={!Number(amount)}
          onPress={async () => {
            setError("");
            try {
              await goalsAPI.allocate(allocating.id, Number(amount));
              setAllocating(null); load();
            } catch (e: any) { setError(e.friendlyMessage); }
          }}
        />
      </Sheet>
    </Screen>
  );
}

export function Sheet({ visible, onClose, title, children }: any) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 }}>
          <Text style={{ color: COLORS.text, fontSize: 18, fontFamily: "Inter_500Medium", marginBottom: 20 }}>{title}</Text>
          {children}
          <Button label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
        </View>
      </View>
    </Modal>
  );
}
