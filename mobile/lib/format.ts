import { RISK_FLAG_THRESHOLD, RISK_WATCH_THRESHOLD, color } from "./theme";

/** Digit grouping everywhere. A raw 640528 is unreadable; 640,528 is not. */
export const sats = (n: number) => Math.round(n ?? 0).toLocaleString("en-US");

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);

export const usdCompact = (n: number) =>
  (n ?? 0) >= 1000
    ? `$${((n ?? 0) / 1000).toFixed(1)}k`
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);

export const pct = (n: number, digits = 2) => `${((n ?? 0) * 100).toFixed(digits)}%`;

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Risk bands mirror the backend's ANOMALY_THRESHOLD: >=56 flags, 30-55 watch,
 * below is normal. The thresholds and colours come from the theme so this
 * cannot drift away from the rest of the app.
 */
export function riskBand(score: number): { label: "High" | "Medium" | "Low"; color: string } {
  if (score >= RISK_FLAG_THRESHOLD) return { label: "High", color: color.danger };
  if (score >= RISK_WATCH_THRESHOLD) return { label: "Medium", color: color.primary };
  return { label: "Low", color: color.success };
}

/** "45 sec", "12 min", "3 h", "2 days": a gap between purchases, in words. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} sec`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  const days = Math.round(s / 86400);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * A fraud model feature as a cardholder would say it.
 *
 * The flagged-transaction card used to print the raw model inputs - a z-score,
 * a log of seconds, a surprisal between 0 and 1 - as "2.41" and "9.21", which
 * explain nothing to the person deciding whether a charge was theirs. Each is
 * converted back to the quantity it was computed from (app/anomaly_detector.py,
 * `_features`), so the wording stays true to the model.
 */
export function fraudFeature(key: string, value: number): { label: string; value: string } {
  switch (key) {
    case "amount_zscore": {
      // Standard deviations from this cardholder's mean in the category.
      const z = Math.abs(value);
      const dir = value >= 0 ? "higher" : "lower";
      return {
        label: "Amount vs your usual in this category",
        value: z < 1 ? "About usual" : z < 3 ? `${titleCase(dir)} than usual` : `Much ${dir} than usual`,
      };
    }
    case "category_frequency":
      return { label: "Share of your purchases in this category", value: `${Math.round(value * 100)}%` };
    case "time_since_last_tx":
      // Stored as log(seconds + 1).
      return { label: "Time since your previous purchase", value: duration(Math.exp(value) - 1) };
    case "hour_rarity":
      // 0 for an hour this cardholder often uses, 1 for one never used.
      return {
        label: "Time of day",
        value: value >= 0.95 ? "A time you have not shopped before"
          : value >= 0.5 ? "Unusual for you" : "Usual for you",
      };
    case "amount_vs_global_avg":
      return { label: "Amount vs your average purchase", value: `${value.toFixed(1)}×` };
    case "merchant_is_new":
      return { label: "First purchase at this merchant", value: value >= 1 ? "Yes" : "No" };
    default:
      return { label: key, value: value.toFixed(2) };
  }
}

/** Which scorer produced a risk score, from its model_version string. */
export function scoredBy(modelVersion: string | undefined): string {
  if (!modelVersion) return "Scorer not recorded";
  if (modelVersion.startsWith("iforest")) return "Scored by your personal model";
  if (modelVersion.startsWith("heuristic")) return "Scored by starter rules until you have more history";
  return `Scored by ${modelVersion}`;
}
