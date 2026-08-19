import type { Transaction } from "./types";

/**
 * Grouping transactions into a statement.
 *
 * A flat list with a relative timestamp on every row ("3h ago", "2d ago") reads
 * as a feed. A statement groups by day under a sticky header and subtotals each
 * day, which is what a bank sends you and what makes the list scannable: you
 * look for a day first, then a merchant within it.
 *
 * Kept pure and free of React so the boundary logic — which is the part that
 * actually breaks, around midnight and week edges — can be unit tested without
 * rendering anything.
 */

export type StatementSection = {
  key: string;
  title: string;
  /** Sats earned across the day; shown right-aligned against the header. */
  totalSats: number;
  data: Transaction[];
};

const DAY_MS = 86_400_000;

/** Local midnight for a date, so "today" means the user's today. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Header for a day, relative to now.
 *
 * Today and Yesterday get names because that is how people refer to them.
 * Inside the last week the weekday alone is unambiguous. Beyond that a date is
 * needed, and beyond the current year the year is too — the smallest label that
 * is still unambiguous at each distance.
 */
export function sectionTitle(when: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(when)) / DAY_MS);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return when.toLocaleDateString("en-US", { weekday: "long" });
  if (when.getFullYear() === now.getFullYear()) {
    return when.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }
  return when.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Group transactions into day sections, newest first.
 *
 * Input order is not assumed: the API returns newest-first today, but a
 * grouping that silently depends on that would break the first time a caller
 * passes an ascending page.
 */
export function toSections(
  transactions: Transaction[],
  now: Date = new Date(),
): StatementSection[] {
  const byDay = new Map<number, Transaction[]>();

  for (const tx of transactions) {
    const day = startOfDay(new Date(tx.created_at));
    const bucket = byDay.get(day);
    if (bucket) bucket.push(tx);
    else byDay.set(day, [tx]);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, rows]) => ({
      key: String(day),
      title: sectionTitle(new Date(day), now),
      totalSats: rows.reduce((sum, t) => sum + t.sats_earned, 0),
      data: [...rows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }));
}

/** Time of day for a row, now that the date lives in the section header. */
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
