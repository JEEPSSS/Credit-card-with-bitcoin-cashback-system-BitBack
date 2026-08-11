import { describe, expect, it } from "vitest";

import { pct, relativeTime, riskBand, sats, titleCase, usd, usdCompact } from "./format";
import { RISK_FLAG_THRESHOLD, RISK_WATCH_THRESHOLD, color, fontSize } from "./theme";

describe("sats", () => {
  it("groups digits so a balance is readable", () => {
    expect(sats(640528)).toBe("640,528");
  });

  it("rounds fractional values", () => {
    expect(sats(1234.6)).toBe("1,235");
  });

  it("survives a missing value rather than rendering NaN", () => {
    expect(sats(undefined as unknown as number)).toBe("0");
  });
});

describe("usd", () => {
  it("formats as currency", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
  });

  it("compacts thousands", () => {
    expect(usdCompact(2500)).toBe("$2.5k");
    expect(usdCompact(999)).toBe("$999.00");
  });
});

describe("pct", () => {
  it("renders a rate as a percentage", () => {
    expect(pct(0.03)).toBe("3.00%");
    expect(pct(0.015, 1)).toBe("1.5%");
  });
});

describe("relativeTime", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it("describes recent times in words", () => {
    expect(relativeTime(ago(30_000))).toBe("just now");
    expect(relativeTime(ago(5 * 60_000))).toBe("5m ago");
    expect(relativeTime(ago(3 * 3_600_000))).toBe("3h ago");
    expect(relativeTime(ago(2 * 86_400_000))).toBe("2d ago");
  });

  it("falls back to a date beyond a week", () => {
    expect(relativeTime(ago(30 * 86_400_000))).toMatch(/^[A-Z][a-z]{2} \d+$/);
  });
});

describe("riskBand", () => {
  it("mirrors the backend thresholds", () => {
    expect(riskBand(RISK_FLAG_THRESHOLD).label).toBe("High");
    expect(riskBand(RISK_FLAG_THRESHOLD - 1).label).toBe("Medium");
    expect(riskBand(RISK_WATCH_THRESHOLD).label).toBe("Medium");
    expect(riskBand(RISK_WATCH_THRESHOLD - 1).label).toBe("Low");
  });

  it("takes its colours from the theme", () => {
    expect(riskBand(100).color).toBe(color.danger);
    expect(riskBand(0).color).toBe(color.success);
  });
});

describe("titleCase", () => {
  it("capitalises a category key", () => {
    expect(titleCase("dining")).toBe("Dining");
  });

  it("leaves an empty string alone", () => {
    expect(titleCase("")).toBe("");
  });
});

describe("the type scale", () => {
  const RATIO = 1.25;
  const BASE = 16;

  it("places every size on a power of the ratio from the 16px base", () => {
    // caption is one step below the base, display is three above it, and the
    // step between title and display is skipped on purpose.
    const expected: Record<keyof typeof fontSize, number> = {
      caption: -1,
      body: 0,
      heading: 1,
      title: 2,
      display: 4,
    };
    for (const [name, power] of Object.entries(expected)) {
      const size = fontSize[name as keyof typeof fontSize];
      expect(size).toBe(Math.round(BASE * RATIO ** power));
    }
  });

  it("is strictly ascending", () => {
    const sizes = Object.values(fontSize);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });

  it("has five sizes; a sixth means the hierarchy is unclear", () => {
    expect(Object.keys(fontSize)).toHaveLength(5);
  });
});
