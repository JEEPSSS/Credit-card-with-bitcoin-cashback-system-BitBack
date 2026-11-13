import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Bell, iconNamed } from "@/components/icons";
import { miscAPI } from "@/lib/api";
import { daySections, timeOfDay } from "@/lib/statement";
import { useAction, useApi } from "@/lib/useApi";
import { refreshError } from "@/lib/screenState";
import type { AppNotification } from "@/lib/types";
import { Button, COLORS, Empty, ErrorNote, Header, InlineError, Label, Loading, Screen } from "@/components/ui";
import { font, fontSize, iconSize, space } from "@/lib/theme";

/**
 * Notifications, grouped by day.
 *
 * The list used to be one run of rows with "17h ago" under each, which reads
 * as a feed. Banking apps file notifications under day headings, as History
 * already files transactions here, so the date is read once per day and each
 * row carries only its time.
 *
 * Unread rows were drawn at half opacity for read ones, which took their text
 * below the contrast minimum. Now every row is at full strength and an unread
 * one carries a dot beside its title, which is how the apps this follows mark
 * it, and the row's spoken name says "unread".
 */
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
    <Screen onRefresh={state.refresh} refreshing={state.refreshing} refreshError={refreshError(state)}>
      <Header back title="Notifications" subtitle={d.unread_count > 0 ? `${d.unread_count} unread` : undefined} />
      {d.unread_count > 0 && (
        <Button
          label="Mark all as read"
          variant="ghost"
          loading={markRead.busy}
          style={{ marginBottom: space.lg }}
          onPress={() => void markRead.run()}
        />
      )}
      <InlineError message={markRead.error} style={{ marginTop: 0, marginBottom: space.md }} />
      {d.items.length === 0 ? (
        <Empty title="Nothing yet" body="Rewards, badges, and price alerts land here." />
      ) : (
        daySections(d.items).map((section) => (
          <View key={section.key} style={styles.section}>
            <Label>{section.title}</Label>
            {section.data.map((n, i) => (
              <Row key={n.id} n={n} last={i === section.data.length - 1} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

function Row({ n, last }: { n: AppNotification; last: boolean }) {
  const Icon = iconNamed(n.icon, Bell);
  const alert = n.type === "alert";
  return (
    <View
      accessible
      accessibilityLabel={`${n.is_read ? "" : "Unread. "}${n.title}. ${n.message}. ${timeOfDay(n.created_at)}`}
      style={[styles.row, { borderBottomWidth: last ? 0 : 1 }]}
    >
      <View style={[styles.puck, { backgroundColor: alert ? COLORS.dangerSoft : COLORS.accentSurface }]}>
        <Icon size={iconSize.md} color={alert ? COLORS.danger : COLORS.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleLine}>
          <Text style={styles.title}>{n.title}</Text>
          {!n.is_read ? <View style={styles.dot} /> : null}
        </View>
        <Text style={styles.message}>{n.message}</Text>
      </View>
      <Text style={styles.time}>{timeOfDay(n.created_at)}</Text>
    </View>
  );
}

const PUCK = 40;

const styles = StyleSheet.create({
  section: { marginBottom: space.xl },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    paddingVertical: space.md + 2,
    borderBottomColor: COLORS.hairline,
  },
  puck: { width: PUCK, height: PUCK, borderRadius: PUCK / 2, alignItems: "center", justifyContent: "center" },
  titleLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { color: COLORS.text, fontSize: fontSize.body - 1, fontFamily: font.medium, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  message: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 3, lineHeight: 19 },
  time: { color: COLORS.muted, fontSize: fontSize.caption, marginTop: 2 },
});
