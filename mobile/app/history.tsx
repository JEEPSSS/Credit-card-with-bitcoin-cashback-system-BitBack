import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { messageFor, miscAPI, transactionAPI } from "@/lib/api";
import { titleCase } from "@/lib/format";
import type { Category, Transaction } from "@/lib/types";
import { ReceiptRow } from "@/components/ReceiptRow";
import { COLORS, Empty, ErrorNote, Header, Loading } from "@/components/ui";
import { fontSize } from "@/lib/theme";

export default function History() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<string | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { miscAPI.categories().then(setCategories).catch(() => {}); }, []);

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
    }
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setPage(1);
    void load(1, filter);
  }, [filter, load]);

  useEffect(reload, [reload]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Header back title="History" />
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 16 }}
        data={[{ category: undefined, label: "All" }, ...categories.map((c) => ({ category: c.category, label: titleCase(c.category) }))]}
        keyExtractor={(i) => i.category ?? "all"}
        renderItem={({ item }) => {
          const active = filter === item.category;
          return (
            <Pressable
              onPress={() => setFilter(item.category)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                minHeight: 36, paddingHorizontal: 14, borderRadius: 8, justifyContent: "center",
                borderWidth: 1, borderColor: active ? COLORS.primary : COLORS.border,
                backgroundColor: active ? COLORS.accentSurface : COLORS.card,
              }}
            >
              <Text style={{ color: active ? COLORS.primary : COLORS.muted, fontSize: fontSize.caption }}>{item.label}</Text>
            </Pressable>
          );
        }}
        style={{ flexGrow: 0 }}
      />
      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorNote message={error} onRetry={reload} />
        </View>
      ) : items.length === 0 ? (
        <Empty title="Nothing here yet" body="Transactions in this category will show up here." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <ReceiptRow
              merchant={item.merchant}
              category={item.category}
              amountFiat={item.amount_fiat}
              satsEarned={item.sats_earned}
              createdAt={item.created_at}
              last={index === items.length - 1}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasMore && !error) {
              const next = page + 1;
              setPage(next);
              void load(next, filter);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}
