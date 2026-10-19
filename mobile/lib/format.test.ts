import { describe, expect, it } from "vitest";

import {
  duration, fraudFeature, pct, relativeTime, riskBand, sats, scoredBy, titleCase, usd, usdCompact,
} from "./format";
import {
  MAX_DISPLAY_FONT_SCALE, RISK_FLAG_THRESHOLD, RISK_WATCH_THRESHOLD, color, fontSize, scaledLineHeight,
} from "./theme";

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

  it("reads the API's timestamps, which are UTC without an offset", () => {
    // A purchase made a moment before showed as "8h ago" in Singapore.
    const fromApi = (ms: number) => ago(ms).replace("Z", "");
    expect(relativeTime(fromApi(30_000))).toBe("just now");
    expect(relativeTime(fromApi(5 * 60_000))).toBe("5m ago");
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

describe("fraudFeature", () => {
  it("turns the amount z-score into words in both directions", () => {
    expect(fraudFeature("amount_zscore", 0.4).value).toBe("About usual");
    expect(fraudFeature("amount_zscore", 1.8).value).toBe("Higher than usual");
    expect(fraudFeature("amount_zscore", -3.5).value).toBe("Much lower than usual");
  });

  it("undoes the log(seconds + 1) the model stores for the gap", () => {
    expect(fraudFeature("time_since_last_tx", Math.log(3 * 3600 + 1)).value).toBe("3 h");
    expect(fraudFeature("time_since_last_tx", 0).value).toBe("0 sec");
  });

  it("reads hour rarity on the model's 0 (routine) to 1 (never seen) scale", () => {
    expect(fraudFeature("hour_rarity", 1).value).toBe("A time you have not shopped before");
    expect(fraudFeature("hour_rarity", 0.6).value).toBe("Unusual for you");
    expect(fraudFeature("hour_rarity", 0.2).value).toBe("Usual for you");
  });

  it("gives every feature the backend sends a plain label", () => {
    const backend = [
      "amount_zscore", "category_frequency", "time_since_last_tx",
      "hour_rarity", "amount_vs_global_avg", "merchant_is_new",
    ];
    for (const key of backend) expect(fraudFeature(key, 1).label).not.toBe(key);
    expect(fraudFeature("merchant_is_new", 1).value).toBe("Yes");
    expect(fraudFeature("category_frequency", 0.05).value).toBe("5%");
    expect(fraudFeature("amount_vs_global_avg", 3.24).value).toBe("3.2×");
  });
});

describe("scoredBy", () => {
  it("names the scorer instead of printing its version string", () => {
    expect(scoredBy("iforest-v3")).toBe("Scored by your personal model");
    expect(scoredBy("heuristic-v1")).toMatch(/starter rules/);
  });
});

describe("duration", () => {
  it("picks a unit a person would use", () => {
    expect(duration(45)).toBe("45 sec");
    expect(duration(720)).toBe("12 min");
    expect(duration(86400)).toBe("1 day");
    expect(duration(3 * 86400)).toBe("3 days");
  });
});

describe("scaledLineHeight", () => {
  it("grows the box with the system text size so digits are not clipped", () => {
    expect(scaledLineHeight(fontSize.display, 1)).toBe(Math.round(fontSize.display * 1.25));
    expect(scaledLineHeight(fontSize.display, 1.3)).toBe(Math.round(fontSize.display * 1.3 * 1.25));
  });

  it("stops at the cap the text itself is held to", () => {
    expect(scaledLineHeight(fontSize.display, 3)).toBe(
      Math.round(fontSize.display * MAX_DISPLAY_FONT_SCALE * 1.25));
  });

  it("never shrinks below the designed height", () => {
    expect(scaledLineHeight(fontSize.display, 0.85)).toBe(Math.round(fontSize.display * 1.25));
  });
});

describe("contrast of the text and field tokens", () => {
  // WCAG 2.2 relative luminance and contrast ratio.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("keeps body and placeholder text at 4.5:1 on every surface a field sits on (1.4.3)", () => {
    for (const bg of [color.canvas, color.surface, color.raised]) {
      for (const fg of [color.text, color.muted, color.placeholder]) {
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the text field edge at 3:1 against the field and the page (1.4.11)", () => {
    expect(ratio(color.outline, color.surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(color.outline, color.canvas)).toBeGreaterThanOrEqual(3);
  });
});
