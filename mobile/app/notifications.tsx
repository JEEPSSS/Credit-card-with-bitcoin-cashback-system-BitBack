import { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Icons from "lucide-react-native";
import { miscAPI } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Button, COLORS, Empty, Header, Loading, Screen } from "@/components/ui";

export default function Notifications() {
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => setD(await miscAPI.notifications()), []);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  if (!d) return <Screen><Loading /></Screen>;

  return (
    <Screen onRefresh={load}>
      <Header back title="Notifications" subtitle={d.unread_count > 0 ? `${d.unread_count} unread` : undefined} />
      {d.unread_count > 0 && (
        <Button label="Mark all as read" variant="ghost" style={{ marginBottom: 20 }} onPress={async () => { await miscAPI.readAll(); load(); }} />
      )}
      {d.items.length === 0 ? (
        <Empty title="Nothing yet" body="Rewards, badges, and price alerts land here." />
      ) : (
        <View>
          {d.items.map((n: any, i: number) => {
            const Icon = (Icons as any)[n.icon.split("-").map((p: string) => p[0].toUpperCase() + p.slice(1)).join("")] ?? Icons.Bell;
            return (
              <View
                key={n.id}
                style={{
                  flexDirection: "row", paddingVertical: 16,
                  borderBottomWidth: i === d.items.length - 1 ? 0 : 1, borderBottomColor: COLORS.border,
                  opacity: n.is_read ? 0.5 : 1,
                }}
              >
                <Icon size={17} color={n.type === "alert" ? COLORS.danger : COLORS.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>{n.title}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 3, lineHeight: 19 }}>{n.message}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 6 }}>{relativeTime(n.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
