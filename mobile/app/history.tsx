import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, SectionList, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { messageFor, miscAPI, transactionAPI } from "@/lib/api";
import { sats, titleCase } from "@/lib/format";
import { toSections } from "@/lib/statement";
import {
  COLORS, MIN_CONTROL_HEIGHT, categoryColor, font, fontSize, radius, space, tracking,
} from "@/lib/theme";
import type { Category, Transaction } from "@/lib/types";
import { ReceiptRow } from "@/components/ReceiptRow";
import { ListSkeleton } from "@/components/Skeleton";
import { Empty, ErrorNote, Header } from "@/components/ui";

/**
 * The statement.
 *
 * Rows are grouped into days under sticky headers, each carrying that day's
 * total earnings in the same right-hand mono column the rows use. The column
 * runs unbroken from header to row to header, which is what makes a list of
 * figures scannable — you read down one edge instead of hunting across.
 *
 * Filter chips take the category's own colour when selected, so the filter and
 * the icon puck below it agree without a legend.
 */
export default function History() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<string | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    miscAPI.categories().then(setCategories).catch(() => {});
  }, []);

  const load = useCallback(async (p: number, cat?: string) => {
    try {
      const r = await transactionAPI.list(p, cat);
      setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items]));
      setHasMore(r.has_more);
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setPage(1);
    void load(1, filter);
  }, [filter, load]);

  useEffect(reload, [reload]);

  const sections = useMemo(() => toSections(items), [items]);

  const chips = useMemo(
    () => [
      { category: undefined as string | undefined, label: "All" },
      ...categories.map((c) => ({ category: c.category as string, label: titleCase(c.category) })),
    ],
    [categories],
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <View style={styles.gutter}>
        <Header back title="History" />
      </View>

      <View style={styles.filterRail}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
          data={chips}
          keyExtractor={(item) => item.category ?? "all"}
          renderItem={({ item }) => {
            const active = filter === item.category;
            const tint = item.category ? categoryColor(item.category) : COLORS.primary;
            return (
              <Pressable
                onPress={() => setFilter(item.category)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? tint : COLORS.border,
                    backgroundColor: active ? `${tint}1F` : COLORS.surface,
                  },
                ]}
              >
                <Text style={{ color: active ? tint : COLORS.muted, fontSize: fontSize.caption }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.gutter}>
          <ListSkeleton rows={7} />
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.gutter}>
          <ErrorNote message={error} onRetry={reload} />
        </View>
      ) : items.length === 0 ? (
        <Empty
          title="Nothing here yet"
          body={
            filter
              ? `No ${filter} transactions on this account.`
              : "Transactions will appear here as you spend."
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => String(t.id)}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionTotal}>+{sats(section.totalSats)}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <ReceiptRow
              merchant={item.merchant}
              category={item.category}
              amountFiat={item.amount_fiat}
              satsEarned={item.sats_earned}
              createdAt={item.created_at}
              last={index === section.data.length - 1}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasMore && !error && !loadingMore) {
              setLoadingMore(true);
              const next = page + 1;
              setPage(next);
              void load(next, filter);
            }
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={COLORS.muted} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  gutter: { paddingHorizontal: space.lg },
  filterRail: { flexGrow: 0 },
  filterContent: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.lg },
  chip: {
    minHeight: MIN_CONTROL_HEIGHT - 4,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    justifyContent: "center",
    borderWidth: 1,
  },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space["3xl"] },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.canvas,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    letterSpacing: tracking.label,
    textTransform: "uppercase",
  },
  sectionTotal: {
    color: COLORS.muted,
    fontSize: fontSize.caption,
    fontFamily: font.mono,
    fontVariant: ["tabular-nums"],
  },
  footer: { paddingVertical: space.xl },
});
