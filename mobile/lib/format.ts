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
 * Risk bands mirror the backend's ANOMALY_THRESHOLD: >=60 flags, 30-59 watch,
 * below is normal. The thresholds and colours come from the theme so this
 * cannot drift away from the rest of the app.
 */
export function riskBand(score: number): { label: "High" | "Medium" | "Low"; color: string } {
  if (score >= RISK_FLAG_THRESHOLD) return { label: "High", color: color.danger };
  if (score >= RISK_WATCH_THRESHOLD) return { label: "Medium", color: color.primary };
  return { label: "Low", color: color.success };
}
