import { describe, expect, it } from "vitest";

import { LEVEL_NAME_WIDTH, fontSize, longestWordWidth, space, wordFitBasis } from "./theme";

describe("wordFitBasis", () => {
  // Home's rows: the screen's side padding, the gap between items, and how many
  // items of a given basis share a line on a phone that many dp wide.
  const content = (dp: number) => dp - 2 * space.lg;
  const gap = space.sm + 2;
  const perLine = (basis: number, dp: number) =>
    Math.max(1, Math.floor((content(dp) + gap) / (basis + gap)));
  const buttons = (scale: number) =>
    wordFitBasis(longestWordWidth("New transaction", fontSize.body), scale, 2 * space.xl);
  const STAT_PADDING = 2 * space.md + 2;

  it("keeps Home's two buttons side by side at 100%, even on a 360dp phone", () => {
    expect(perLine(buttons(1), 360)).toBe(2);
  });

  it("stacks them at 200% rather than split \"transaction\"", () => {
    expect(perLine(buttons(2), 411)).toBe(1);
  });

  it("keeps the three stat tiles on one line at 100% on a 360dp phone", () => {
    expect(perLine(wordFitBasis(LEVEL_NAME_WIDTH, 1, STAT_PADDING), 360)).toBe(3);
  });

  it("never leaves a stat tile narrower than the widest level name", () => {
    // 68: "Diamond" in Inter Medium 16 at 100%.
    for (const dp of [360, 411]) {
      for (let scale = 1; scale <= 2.001; scale += 0.05) {
        const n = perLine(wordFitBasis(LEVEL_NAME_WIDTH, scale, STAT_PADDING), dp);
        const inner = (content(dp) - (n - 1) * gap) / n - STAT_PADDING;
        expect(inner).toBeGreaterThanOrEqual(68 * scale);
      }
    }
  });

  it("does not go below the 100% width when text is set smaller", () => {
    expect(wordFitBasis(LEVEL_NAME_WIDTH, 0.85, STAT_PADDING)).toBe(LEVEL_NAME_WIDTH + STAT_PADDING);
  });
});

describe("longestWordWidth", () => {
  it("errs wide of the measured width, so rows wrap early rather than late", () => {
    // Inter Medium 16 at 100%: "transaction" 86, "protection" 78, "research" 67.
    expect(longestWordWidth("New transaction", fontSize.body)).toBeGreaterThanOrEqual(86);
    expect(longestWordWidth("Fraud protection", fontSize.body)).toBeGreaterThanOrEqual(78);
    expect(longestWordWidth("Product research survey", fontSize.body)).toBeGreaterThanOrEqual(67);
  });
});
