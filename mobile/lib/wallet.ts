import { sectionTitle } from "./statement";
import { serverTime } from "./time";
import type { GrowthPoint, LedgerEntry } from "./types";

/**
 * Turning the wallet's two feeds into what the Wallet screen draws: bars of
 * sats earned, and a ledger grouped by day.
 *
 * Kept pure and free of React, like lib/statement.ts, so the bucket edges —
 * the part that goes wrong, at month ends and with short histories — are unit
 * tested without rendering anything.
 */

export type WalletPeriod = "7d" | "30d" | "90d" | "all";

export type EarnedBar = {
  key: string;
  /** Under the bar: a weekday, a start date, or a month. */
  label: string;
  /** Read out for the bar, and shown with its figure: the label in full. */
  name: string;
  sats: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Days in each 30D bar. Five bars of six days cover the period exactly. */
const SPAN_30D = 6;
/** The most bars that fit a phone's width with a label under each. */
const MAX_BARS = 12;

/**
 * A day from the growth feed, "2026-11-12". Read as plain calendar parts: the
 * string has no time, and `new Date("2026-11-12")` would read it as UTC
 * midnight, which is the previous evening in any zone west of Greenwich.
 */
function calendarDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Sats earned per bar across a period.
 *
 * The feed is a running balance, one point a day, so what was earned on a day
 * is the step up from the day before. The first day's step is measured from
 * the opening balance, which the feed gives indirectly: the last point less
 * the period's growth.
 *
 * - 7D: a bar a day.
 * - 30D: five bars of six days, named by the day each starts.
 * - 90D and All: a bar a calendar month. Months before the first sats were
 *   earned are dropped, so a new account's year is not eleven empty bars.
 */
export function earnedBars(points: GrowthPoint[], growthSats: number, period: WalletPeriod): EarnedBar[] {
  if (points.length === 0) return [];
  const opening = points[points.length - 1].sats - growthSats;
  const days = points.map((p, i) => ({
    date: calendarDay(p.date),
    sats: p.sats - (i === 0 ? opening : points[i - 1].sats),
  }));

  if (period === "7d") {
    return days.slice(-7).map(({ date, sats }) => ({
      key: date.toDateString(),
      label: WEEKDAYS[date.getDay()],
      name: WEEKDAYS_LONG[date.getDay()],
      sats,
    }));
  }

  if (period === "30d") {
    const recent = days.slice(-5 * SPAN_30D);
    const bars: EarnedBar[] = [];
    for (let i = 0; i < recent.length; i += SPAN_30D) {
      const span = recent.slice(i, i + SPAN_30D);
      const first = span[0].date;
      const last = span[span.length - 1].date;
      bars.push({
        key: first.toDateString(),
        label: `${first.getDate()} ${MONTHS[first.getMonth()]}`,
        name: `${first.getDate()} ${MONTHS[first.getMonth()]} to ${last.getDate()} ${MONTHS[last.getMonth()]}`,
        sats: span.reduce((sum, d) => sum + d.sats, 0),
      });
    }
    return bars;
  }

  const byMonth = new Map<string, EarnedBar>();
  for (const { date, sats } of days) {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bar = byMonth.get(key);
    if (bar) bar.sats += sats;
    else {
      byMonth.set(key, {
        key,
        label: MONTHS[date.getMonth()],
        name: `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`,
        sats,
      });
    }
  }
  const months = [...byMonth.values()];
  const firstEarning = months.findIndex((m) => m.sats !== 0);
  return months.slice(Math.max(firstEarning, 0)).slice(-MAX_BARS);
}

/**
 * The top of the chart's scale: the largest bar rounded up to 1, 2, 2.5 or 5
 * times a power of ten, so the gridlines land on figures a person would say.
 */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** 250000 as "250k", 1500000 as "1.5M": an axis label, not a figure. */
export function compactSats(value: number): string {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

/**
 * How the last bar compares with the one before it, as a signed fraction, or
 * null when there is nothing to compare with. A first month has no "before",
 * and growth from zero is not a percentage.
 */
export function changeOnPrevious(bars: EarnedBar[]): { change: number; against: string } | null {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  if (previous.sats <= 0) return null;
  return { change: (last.sats - previous.sats) / previous.sats, against: previous.label };
}

export type LedgerSection = { key: string; title: string; data: LedgerEntry[] };

/** Ledger entries under day headings, newest first; the same headings History uses. */
export function ledgerSections(entries: LedgerEntry[], now: Date = new Date()): LedgerSection[] {
  const byDay = new Map<number, LedgerEntry[]>();
  for (const entry of entries) {
    const when = serverTime(entry.created_at);
    const day = new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime();
    const bucket = byDay.get(day);
    if (bucket) bucket.push(entry);
    else byDay.set(day, [entry]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, rows]) => ({
      key: String(day),
      title: sectionTitle(new Date(day), now),
      data: [...rows].sort(
        (a, b) => serverTime(b.created_at).getTime() - serverTime(a.created_at).getTime(),
      ),
    }));
}
