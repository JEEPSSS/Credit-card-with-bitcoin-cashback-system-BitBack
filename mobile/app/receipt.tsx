import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { Receipt } from "@/components/Receipt";
import { Header, Screen } from "@/components/ui";
import { space } from "@/lib/theme";

/**
 * One transaction's receipt. Built from the route's params, which the row that
 * opened it fills in from the list it already has, so there is no second
 * request and nothing to wait for.
 */
export default function ReceiptScreen() {
  const p = useLocalSearchParams<{
    id: string; merchant: string; category: string; amount: string;
    price: string; sats: string; at: string;
  }>();

  return (
    <Screen>
      <Header back title="Receipt" />
      <View style={{ marginTop: space.md }}>
        <Receipt
          data={{
            id: Number(p.id),
            merchant: String(p.merchant ?? ""),
            category: String(p.category ?? "general"),
            amountFiat: Number(p.amount),
            btcPrice: Number(p.price),
            satsEarned: Number(p.sats),
            createdAt: String(p.at),
          }}
        />
      </View>
    </Screen>
  );
}
