import { describe, expect, it } from "vitest";

import { sectionTitle, timeOfDay, toSections } from "./statement";
import type { Transaction } from "./types";

const NOW = new Date("2026-03-15T12:00:00");

function tx(id: number, iso: string, satsEarned = 100): Transaction {
  return {
    id,
    amount_fiat: 25,
    currency: "USD",
    category: "dining",
    merchant: `Shop ${id}`,
    btc_price_at_time: 50_000,
    sats_earned: satsEarned,
    status: "completed",
    created_at: iso,
  };
}

describe("sectionTitle", () => {
  it("names the two days people name", () => {
    expect(sectionTitle(new Date("2026-03-15T09:00:00"), NOW)).toBe("Today");
    expect(sectionTitle(new Date("2026-03-14T23:59:00"), NOW)).toBe("Yesterday");
  });

  it("uses the weekday inside the last week", () => {
    expect(sectionTitle(new Date("2026-03-11T09:00:00"), NOW)).toBe("Wednesday");
  });

  it("uses a date beyond a week", () => {
    expect(sectionTitle(new Date("2026-02-02T09:00:00"), NOW)).toBe("February 2");
  });

  it("adds the year once it is a different one", () => {
    expect(sectionTitle(new Date("2025-11-02T09:00:00"), NOW)).toBe("November 2, 2025");
  });

  it("treats a time later today as Today, not as the future", () => {
    expect(sectionTitle(new Date("2026-03-15T23:00:00"), NOW)).toBe("Today");
  });

  it("splits on local midnight, not on a 24-hour window", () => {
    // 20 hours apart, but either side of midnight, so two different days.
    expect(sectionTitle(new Date("2026-03-14T20:00:00"), NOW)).toBe("Yesterday");
    expect(sectionTitle(new Date("2026-03-15T00:30:00"), NOW)).toBe("Today");
  });
});

describe("toSections", () => {
  it("groups by day, newest day first", () => {
    const sections = toSections(
      [
        tx(1, "2026-03-13T10:00:00"),
        tx(2, "2026-03-15T10:00:00"),
        tx(3, "2026-03-14T10:00:00"),
      ],
      NOW,
    );
    expect(sections.map((s) => s.title)).toEqual(["Today", "Yesterday", "Friday"]);
  });

  it("subtotals each day", () => {
    const sections = toSections(
      [
        tx(1, "2026-03-15T09:00:00", 300),
        tx(2, "2026-03-15T18:00:00", 450),
        tx(3, "2026-03-14T09:00:00", 120),
      ],
      NOW,
    );
    expect(sections[0].totalSats).toBe(750);
    expect(sections[1].totalSats).toBe(120);
  });

  it("orders rows newest-first inside a day", () => {
    const sections = toSections(
      [tx(1, "2026-03-15T09:00:00"), tx(2, "2026-03-15T18:00:00")],
      NOW,
    );
    expect(sections[0].data.map((t) => t.id)).toEqual([2, 1]);
  });

  it("does not assume the input is already sorted", () => {
    const ascending = [
      tx(1, "2026-03-13T10:00:00"),
      tx(2, "2026-03-14T10:00:00"),
      tx(3, "2026-03-15T10:00:00"),
    ];
    expect(toSections(ascending, NOW).map((s) => s.title)).toEqual([
      "Today", "Yesterday", "Friday",
    ]);
  });

  it("returns nothing for an empty statement", () => {
    expect(toSections([], NOW)).toEqual([]);
  });

  it("gives every section a stable unique key", () => {
    const sections = toSections(
      [tx(1, "2026-03-15T09:00:00"), tx(2, "2026-03-14T09:00:00")],
      NOW,
    );
    expect(new Set(sections.map((s) => s.key)).size).toBe(2);
  });
});

describe("timeOfDay", () => {
  it("renders a clock time, since the date is in the header", () => {
    expect(timeOfDay("2026-03-15T14:05:00")).toMatch(/^2:05\s?PM$/);
  });
});
