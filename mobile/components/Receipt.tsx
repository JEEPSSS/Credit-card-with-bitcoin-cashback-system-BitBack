import { useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";

import ReceiptCard from "@/components/reacticx/receipt-card";
import { pct, sats, titleCase, usd } from "@/lib/format";
import { serverTime } from "@/lib/time";
import { COLORS, space } from "@/lib/theme";
import type { RewardBreakdown, Transaction } from "@/lib/types";

/**
 * A transaction as a till receipt.
 *
 * Until now a transaction was a row and nothing more: tapping History went
 * nowhere, and the one place the reward was split into its parts (the preview
 * on Transact) vanished the moment you confirmed. The receipt is the detail
 * view that was missing, and a receipt is the form people already know for
 * "what was this and how was it worked out".
 *
 * It prints only what the server stored. Every transaction keeps its amount,
 * category, the BTC price at the time and the sats paid, so those lines are
 * always there, with the rate worked back from them. The base / level / boost
 * split is not stored per transaction (it depends on the level and boost on
 * the day), so it is printed only when it is known: straight after paying,
 * from the response. An older receipt does not guess at it.
 *
 * Drawn by Reacticx's ReceiptCard (MIT; see components/reacticx).
 */

const MAX_WIDTH = 380;
const SATS_PER_BTC = 100_000_000;

export type ReceiptData = {
  id: number;
  merchant: string;
  category: string;
  amountFiat: number;
  btcPrice: number;
  satsEarned: number;
  createdAt: string;
  /** The split of the reward; only known for a payment made just now. */
  breakdown?: RewardBreakdown;
};

export const receiptFrom = (t: Transaction, breakdown?: RewardBreakdown): ReceiptData => ({
  id: t.id,
  merchant: t.merchant,
  category: t.category,
  amountFiat: t.amount_fiat,
  btcPrice: t.btc_price_at_time,
  satsEarned: t.sats_earned,
  createdAt: t.created_at,
  breakdown,
});

/** Open a transaction's receipt. The screen is built from the route's params. */
export function openReceipt(t: Transaction) {
  router.push({
    pathname: "/receipt",
    params: {
      id: String(t.id),
      merchant: t.merchant,
      category: t.category,
      amount: String(t.amount_fiat),
      price: String(t.btc_price_at_time),
      sats: String(t.sats_earned),
      at: t.created_at,
    },
  });
}

export const receiptCode = (id: number) => `TX-${String(id).padStart(6, "0")}`;

const stamp = (iso: string) => {
  const d = serverTime(iso);
  const day = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
};

const PALETTE = {
  paper: COLORS.paperCard,
  ink: COLORS.ink,
  muted: COLORS.inkMuted,
  accent: COLORS.ink,
  rule: "#C9C3B9",
  leader: "#9A9388",
};

export function Receipt({ data }: { data: ReceiptData }) {
  const { width } = useWindowDimensions();
  const paperWidth = Math.min(width - space.lg * 2, MAX_WIDTH);
  const code = receiptCode(data.id);
  const b = data.breakdown;

  // Rate worked back from what was paid, so it is true for any transaction.
  const rate = useMemo(
    () => (data.amountFiat > 0 ? ((data.satsEarned / SATS_PER_BTC) * data.btcPrice) / data.amountFiat : 0),
    [data],
  );

  const ink = { color: PALETTE.ink };
  const when = stamp(data.createdAt);

  return (
    <View
      accessible
      accessibilityLabel={
        `Receipt ${code}, ${when}. ${data.merchant}, ${titleCase(data.category)}, ${usd(data.amountFiat)}. ` +
        `Bitcoin at ${usd(data.btcPrice)}. ` +
        (b
          ? `Base cashback ${sats(b.base_sats)} sats` +
            (b.level_bonus > 0 ? `, level bonus ${sats(b.level_bonus)}` : "") +
            (b.boost_bonus > 0 ? `, boost bonus ${sats(b.boost_bonus)}` : "") + ". "
          : `${pct(rate, 1)} back. `) +
        `${sats(data.satsEarned)} sats earned.`
      }
    >
      <ReceiptCard width={paperWidth} tilted={false} palette={PALETTE}>
        <ReceiptCard.TornEdge side="top" />
        <ReceiptCard.Header>
          <ReceiptCard.Store>BitBack</ReceiptCard.Store>
          <ReceiptCard.Meta>{code} · {when}</ReceiptCard.Meta>
        </ReceiptCard.Header>

        <ReceiptCard.Separator />
        <ReceiptCard.Items>
          <ReceiptCard.Item label="Merchant" value={data.merchant} labelStyle={ink}
            valueStyle={{ ...ink, flexShrink: 1, textAlign: "right" }} />
          <ReceiptCard.Item label="Category" value={titleCase(data.category)} labelStyle={ink} valueStyle={ink} />
          <ReceiptCard.Item label="Amount" value={usd(data.amountFiat)} labelStyle={ink} valueStyle={ink} />
          <ReceiptCard.Item label="BTC price" value={usd(data.btcPrice)} labelStyle={ink} valueStyle={ink} />
        </ReceiptCard.Items>

        <ReceiptCard.Separator />
        <ReceiptCard.Items>
          {b ? (
            <>
              <ReceiptCard.Item label={`Base cashback ${pct(b.cashback_rate, 1)}`} value={sats(b.base_sats)}
                labelStyle={ink} valueStyle={ink} />
              {b.level_bonus > 0 && (
                <ReceiptCard.Item label={`Level bonus ${b.level_multiplier}x`} value={`+${sats(b.level_bonus)}`}
                  labelStyle={ink} valueStyle={ink} />
              )}
              {b.boost_bonus > 0 && (
                <ReceiptCard.Item label={`Boost ${b.boost_multiplier}x`} value={`+${sats(b.boost_bonus)}`}
                  labelStyle={ink} valueStyle={ink} />
              )}
            </>
          ) : (
            <ReceiptCard.Item label="Rate back" value={pct(rate, 1)} labelStyle={ink} valueStyle={ink} />
          )}
        </ReceiptCard.Items>

        <ReceiptCard.Separator variant="solid" />
        <ReceiptCard.Total label="Sats earned" value={sats(data.satsEarned)}
          valueStyle={{ color: COLORS.inkAccent }} />

        <ReceiptCard.Note>Paid out to your wallet</ReceiptCard.Note>
        <ReceiptCard.Barcode code={code} />
        <ReceiptCard.TornEdge side="bottom" />
      </ReceiptCard>
    </View>
  );
}
