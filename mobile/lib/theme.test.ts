import { describe, expect, it } from "vitest";

import { LEVEL_NAME_WIDTH, fontSize, longestWordWidth, space, wordFitBasis } from "./theme";

// Widths measured in Inter Medium at 100% text: [word, size, width].
const MEASURED: [string, number, number][] = [
  ["transaction", fontSize.body, 86.0],
  ["Platinum", fontSize.body, 66.3],
  ["Diamond", fontSize.body, 68.1],
  ["protection", fontSize.body, 78.2],
  ["Entertainment", fontSize.body, 107.4],
  ["Transactions", fontSize.caption, 80.2],
  ["Lightning", fontSize.caption, 57.9],
  ["category", fontSize.caption, 55.6],
];

describe("longestWordWidth", () => {
  it("errs wide of the measured width, so rows wrap early rather than late", () => {
    for (const [word, size, width] of MEASURED) {
      expect(longestWordWidth(`the ${word}`, size), word).toBeGreaterThanOrEqual(width);
    }
  });

  it("stays within 10% of it, so rows do not wrap at 100% for no reason", () => {
    // A flat 0.62em a letter put "Transactions" 21% wide.
    for (const [word, size, width] of MEASURED) {
      expect(longestWordWidth(word, size), word).toBeLessThanOrEqual(width * 1.1);
    }
  });

  it("errs wide on a character it has no width for", () => {
    expect(longestWordWidth("ü", 10)).toBeGreaterThan(longestWordWidth("u", 10));
  });
});

describe("wordFitBasis", () => {
  // A screen's side padding, the gap between items, and how many items of a
  // given width share a line on a phone that many dp wide.
  const content = (dp: number) => dp - 2 * space.lg;
  const gap = space.sm + 2;
  const perLine = (basis: number, dp: number, g = gap) =>
    Math.max(1, Math.floor((content(dp) + g) / (basis + g)));
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
    for (const dp of [360, 411]) {
      for (let scale = 1; scale <= 2.001; scale += 0.05) {
        const n = perLine(wordFitBasis(LEVEL_NAME_WIDTH, scale, STAT_PADDING), dp);
        const inner = (content(dp) - (n - 1) * gap) / n - STAT_PADDING;
        expect(inner).toBeGreaterThanOrEqual(68.1 * scale);
      }
    }
  });

  it("keeps Profile's three tiles on one line at 100% on the test emulator", () => {
    const tile = wordFitBasis(longestWordWidth("Transactions", fontSize.caption), 1, 2 * 12 + 2);
    expect(perLine(tile, 411, 8)).toBe(3);
  });

  it("does not go below the 100% width when text is set smaller", () => {
    expect(wordFitBasis(LEVEL_NAME_WIDTH, 0.85, STAT_PADDING)).toBe(LEVEL_NAME_WIDTH + STAT_PADDING);
  });
});
