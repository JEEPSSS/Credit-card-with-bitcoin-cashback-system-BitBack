import { useCallback } from "react";
import { View, Text } from "react-native";
import * as Icons from "lucide-react-native";
import { miscAPI } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { Button, COLORS, Empty, ErrorNote, Header, Loading, Screen } from "@/components/ui";
import { font, fontSize, iconSize } from "@/lib/theme";

export default function Notifications() {
  const state = useApi(useCallback(() => miscAPI.notifications(), []));
  const markRead = useAction(async () => {
    await miscAPI.readAll();
    await state.reload();
  });

  if (state.error && !state.data) {
    return (
      <Screen>
        <Header back title="Notifications" />
        <ErrorNote message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  if (!state.data) return <Screen><Loading /></Screen>;

  const d = state.data;

  return (
    <Screen onRefresh={state.refresh} refreshing={state.refreshing}>
      <Header back title="Notifications" subtitle={d.unread_count > 0 ? `${d.unread_count} unread` : undefined} />
      {d.unread_count > 0 && (
        <Button
          label="Mark all as read"
          variant="ghost"
          loading={markRead.busy}
          style={{ marginBottom: 20 }}
          onPress={() => void markRead.run()}
        />
      )}
      {d.items.length === 0 ? (
        <Empty title="Nothing yet" body="Rewards, badges, and price alerts land here." />
      ) : (
        <View>
          {d.items.map((n, i) => {
            const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[
              n.icon.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("")
            ] ?? Icons.Bell;
            return (
              <View
                key={n.id}
                style={{
                  flexDirection: "row", paddingVertical: 16,
                  borderBottomWidth: i === d.items.length - 1 ? 0 : 1, borderBottomColor: COLORS.border,
                  opacity: n.is_read ? 0.5 : 1,
                }}
              >
                <Icon size={iconSize.md} color={n.type === "alert" ? COLORS.danger : COLORS.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: COLORS.text, fontSize: fontSize.caption, fontFamily: font.medium }}>{n.title}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 3, lineHeight: 19 }}>{n.message}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: fontSize.caption, marginTop: 6 }}>{relativeTime(n.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
