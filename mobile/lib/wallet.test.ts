import { describe, expect, it } from "vitest";

import { changeOnPrevious, compactSats, earnedBars, ledgerSections, niceCeiling } from "./wallet";
import type { GrowthPoint, LedgerEntry } from "./types";

/** A running balance, one point a day from `start`, earning `daily[i]` on day i. */
function feed(start: string, daily: number[], opening = 0): { points: GrowthPoint[]; growth: number } {
  const [y, m, d] = start.split("-").map(Number);
  let running = opening;
  const points = daily.map((sats, i) => {
    running += sats;
    const day = new Date(y, m - 1, d + i);
    const iso = [day.getFullYear(), String(day.getMonth() + 1).padStart(2, "0"), String(day.getDate()).padStart(2, "0")].join("-");
    return { date: iso, sats: running, usd: 0 };
  });
  return { points, growth: running - opening };
}

describe("earnedBars", () => {
  it("measures the first day from the opening balance, not from zero", () => {
    const { points, growth } = feed("2026-11-06", [100, 0, 50, 0, 0, 25, 10], 5000);
    const bars = earnedBars(points, growth, "7d");
    expect(bars.map((b) => b.sats)).toEqual([100, 0, 50, 0, 0, 25, 10]);
  });

  it("gives 7D a bar a day, named by weekday", () => {
    // The feed carries days + 1 points; only the last seven are drawn.
    const { points, growth } = feed("2026-11-05", [9, 1, 2, 3, 4, 5, 6, 7]);
    const bars = earnedBars(points, growth, "7d");
    expect(bars).toHaveLength(7);
    expect(bars[0].label).toBe("Fri"); // 6 November 2026
    expect(bars[6].label).toBe("Thu");
    expect(bars[6].name).toBe("Thursday");
  });

  it("gives 30D five bars of six days that add up to the last thirty days", () => {
    const { points, growth } = feed("2026-10-13", Array.from({ length: 31 }, (_, i) => i + 1));
    const bars = earnedBars(points, growth, "30d");
    expect(bars).toHaveLength(5);
    expect(bars[0].label).toBe("14 Oct");
    expect(bars[0].name).toBe("14 Oct to 19 Oct");
    // Days 2..31 of the feed: everything except the oldest point.
    expect(bars.reduce((sum, b) => sum + b.sats, 0)).toBe(growth - 1);
  });

  it("gives 90D and All a bar a calendar month, splitting at month ends", () => {
    // 30 and 31 October, then 1 November.
    const { points, growth } = feed("2026-10-30", [10, 20, 40]);
    const bars = earnedBars(points, growth, "90d");
    expect(bars.map((b) => [b.label, b.sats])).toEqual([["Oct", 30], ["Nov", 40]]);
    expect(bars[1].name).toBe("November 2026");
  });

  it("drops the empty months before the first sats were earned", () => {
    const quiet = Array.from({ length: 70 }, () => 0);
    const { points, growth } = feed("2026-08-01", [...quiet, 500, 0, 0]);
    const bars = earnedBars(points, growth, "all");
    expect(bars.map((b) => b.label)).toEqual(["Oct"]);
  });

  it("keeps a year to twelve bars", () => {
    const { points, growth } = feed("2025-11-01", Array.from({ length: 380 }, () => 1));
    expect(earnedBars(points, growth, "all")).toHaveLength(12);
  });

  it("returns nothing for an empty feed", () => {
    expect(earnedBars([], 0, "30d")).toEqual([]);
  });
});

describe("niceCeiling", () => {
  it("rounds up to a figure a person would say", () => {
    expect(niceCeiling(249_159)).toBe(250_000);
    expect(niceCeiling(72_865)).toBe(100_000);
    expect(niceCeiling(1_200)).toBe(2_000);
    expect(niceCeiling(500)).toBe(500);
  });

  it("never returns zero, which would divide the bars by nothing", () => {
    expect(niceCeiling(0)).toBe(1);
  });
});

describe("compactSats", () => {
  it("shortens thousands and millions", () => {
    expect(compactSats(250_000)).toBe("250k");
    expect(compactSats(125_000)).toBe("125k");
    expect(compactSats(1_500_000)).toBe("1.5M");
    expect(compactSats(0)).toBe("0");
  });
});

describe("changeOnPrevious", () => {
  const bar = (label: string, sats: number) => ({ key: label, label, name: label, sats });

  it("compares the last bar with the one before", () => {
    expect(changeOnPrevious([bar("Oct", 100), bar("Nov", 175)])).toEqual({ change: 0.75, against: "Oct" });
  });

  it("has nothing to say about a first bar or growth from zero", () => {
    expect(changeOnPrevious([bar("Nov", 175)])).toBeNull();
    expect(changeOnPrevious([bar("Oct", 0), bar("Nov", 175)])).toBeNull();
  });
});

describe("ledgerSections", () => {
  const entry = (id: number, created_at: string): LedgerEntry =>
    ({ id, amount_sats: 100, type: "cashback", status: "completed", created_at });

  it("groups by the user's day, newest first", () => {
    // The suite runs in Singapore, UTC+8: 17:00 UTC on the 11th is 01:00 on the 12th.
    const now = new Date(2026, 10, 12, 21, 0);
    const sections = ledgerSections(
      [entry(1, "2026-11-10T03:00:00"), entry(2, "2026-11-11T17:00:00"), entry(3, "2026-11-12T02:00:00")],
      now,
    );
    expect(sections.map((s) => s.title)).toEqual(["Today", "Tuesday"]);
    expect(sections[0].data.map((e) => e.id)).toEqual([3, 2]);
  });
});
