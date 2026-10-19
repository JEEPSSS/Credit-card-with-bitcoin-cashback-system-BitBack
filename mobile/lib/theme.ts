/**
 * BitBack design tokens.
 *
 * Every value here derives from a stated constraint so it can be defended in
 * the report. Nothing is chosen by eye, and nothing outside this file may
 * declare a colour, a size, or a duration.
 */

/* ------------------------------------------------------------------ colour */

/**
 * Neutral ramp.
 *
 * Warm-biased: hue held near 40°, saturation 2-5%. A pure-grey neutral next to
 * a saturated orange reads as two unrelated systems — the grey looks blue by
 * simultaneous contrast. Biasing the neutrals a few degrees toward the accent
 * makes the palette read as one decision. The bias is kept under 5% saturation
 * so it never tips into sepia, which is a different and much-copied look.
 *
 * Thirteen steps rather than the three the app started with, because a dark
 * interface separates surfaces by luminance steps of 3-5%, not by shadow:
 * a drop shadow on a near-black ground is invisible, so elevation has to be
 * carried by the surface itself and a hairline.
 */
const ramp = {
  canvas: '#0A0A0A',   // the ground; nothing sits behind it
  sunken: '#0F0E0E',   // wells, input tracks
  surface: '#151414',  // cards
  raised: '#1B1A19',   // controls on cards
  elevated: '#222120', // sheets, popovers
  hairline: '#272524', // list separators
  border: '#322F2D',   // card edges and dividers - decorative, so no contrast minimum
  subtle: '#4D4946',   // disabled glyphs - exempt from contrast as inactive
  outline: '#716B66',  // text field edges - 3.5:1 on surface, WCAG 1.4.11's 3:1
  faint: '#86817B',    // placeholder text - 4.8:1 on surface, WCAG 1.4.3's 4.5:1
  muted: '#97918B',    // secondary text - 6.4:1 on canvas, 5.9:1 on surface
  bright: '#C9C3BC',   // emphasised secondary
  text: '#F2F0EC',     // primary text - 17.4:1 on canvas
} as const;

/**
 * Accent. Bitcoin orange, unchanged from the brand.
 *
 * `soft` and `edge` are the accent at 8% and 22% over the canvas, precomputed
 * rather than composited at runtime so a selected chip is one flat fill and
 * not a stack of translucent layers.
 */
const accent = {
  primary: '#F7931A',
  primaryPressed: '#D97C0E',
  soft: '#2A1D08',
  edge: '#4A3410',
  onPrimary: '#1A1206',   // 8.1:1 on primary
} as const;

/**
 * Semantic. Green reads as credit, red as debit or flagged. Never decorative.
 * Both are pulled a few degrees warm to sit in the same family as the ramp.
 */
const semantic = {
  success: '#35A56A',
  successSoft: '#0F2419',
  danger: '#E05252',
  dangerSoft: '#2A1313',
  dangerEdge: '#4A2020',
} as const;

export const color = {
  ...ramp,
  ...accent,
  ...semantic,

  // Legacy aliases kept so call sites read naturally.
  bg: ramp.canvas,
  card: ramp.surface,
  placeholder: ramp.faint,
  accentSurface: accent.soft,
  accentBorder: accent.edge,
  dangerBorder: semantic.dangerEdge,
} as const;

/** `COLORS` reads better than `color` at a call site. */
export const COLORS = color;

/**
 * Category colours.
 *
 * Ten hues spaced around the wheel but held at roughly constant lightness
 * (L* ≈ 62) and moderate chroma, so they read as one family rather than a
 * rainbow — the difference between a considered category system and a set of
 * default chart colours. Every one clears 3:1 on the canvas, which is the WCAG
 * 2.2 minimum for a non-text graphic.
 *
 * Deliberately none of them is the accent: the accent means "sats earned"
 * everywhere in the app, and a category that borrowed it would dilute that.
 */
export const CATEGORY_COLOR = {
  dining: '#D9744F',
  groceries: '#85A85A',
  transport: '#5E93C9',
  shopping: '#C97DAE',
  entertainment: '#8D7CC9',
  travel: '#4FA9A2',
  health: '#DB7480',
  education: '#C6A44E',
  bills: '#8A8F99',
  general: '#86817C',
} as const;

/**
 * Reward tier finishes, used by the card face.
 *
 * Real cards signal tier through material, so these are named after metals and
 * run cool as they climb — bronze warm, platinum and diamond cold. That gives
 * the progression a direction the eye reads without a label.
 */
export const TIER = {
  bronze: { face: '#3A2A1C', edge: '#B0703C', ink: '#F0E4D8' },
  silver: { face: '#2B2D30', edge: '#9AA0A6', ink: '#EDEFF2' },
  gold: { face: '#3A2E14', edge: '#D9A63C', ink: '#F6EEDA' },
  platinum: { face: '#33353A', edge: '#E2E4E8', ink: '#FFFFFF' },
  diamond: { face: '#1B3138', edge: '#A8DCEA', ink: '#EAF8FC' },
} as const;

export type TierKey = keyof typeof TIER;

/* -------------------------------------------------------------- typography */

/**
 * Type scale: a 1.25 modular scale anchored at 16.
 *
 *   16 / 1.25  ≈ 13    caption
 *   16                 body
 *   16 × 1.25  = 20    heading
 *   20 × 1.25  = 25    title
 *   25 × 1.25² ≈ 39    display
 *
 * Five sizes. One step is deliberately skipped between `title` and `display`:
 * 31 sits close enough to 25 that the two do not read as different levels, and
 * the only thing set at display size is a balance that must dominate its screen.
 * Adding a sixth means the hierarchy is unclear, not that you need another size.
 */
export const fontSize = {
  caption: 13,
  body: 16,
  heading: 20,
  title: 25,
  display: 39,
} as const;

/** Two families, three roles. Numerals are always mono so columns align. */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  mono: 'JetBrainsMono_500Medium',
} as const;

/**
 * Line heights as multipliers of the size they apply to. Running text gets
 * 1.45; anything set at display size gets 1.1, because generous leading on a
 * single large figure just pushes it off its own baseline.
 */
export const leading = {
  tight: 1.1,
  snug: 1.3,
  normal: 1.45,
} as const;

/**
 * Tracking. Uppercase labels need positive tracking to stay legible at 13px;
 * display figures need slight negative tracking or they look loose.
 */
export const tracking = {
  label: 0.5,
  display: -0.5,
} as const;

/* ------------------------------------------------------------------ layout */

/** 4pt grid. Any padding not on this scale is a bug. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

/**
 * Three radii. Controls, cards, and the payment card itself — the last is
 * fixed by the physical spec below rather than chosen.
 */
export const radius = {
  control: 8,
  card: 12,
  payment: 14,
  pill: 999,
} as const;

/**
 * Apple HIG minimum is 44pt; Material 3 minimum is 48dp.
 * Taking the larger satisfies both platforms with one number.
 */
export const MIN_TOUCH_TARGET = 48;

/** Secondary controls inside a row are drawn at 40 to keep rows compact. */
export const MIN_CONTROL_HEIGHT = 40;

/**
 * Extra touch area above and below those 40pt controls so each still takes a
 * 48dp press, the Android core app quality minimum. Wrapped rows of them sit
 * 8 apart, so 4 each way meets the next row's without overlapping it; nothing
 * is added at the sides, where neighbours can be closer.
 */
const slop = (MIN_TOUCH_TARGET - MIN_CONTROL_HEIGHT) / 2;
export const CONTROL_HIT_SLOP = { top: slop, bottom: slop } as const;

/**
 * ISO/IEC 7810 ID-1 — the standard every payment card in the world is cut to:
 * 85.60 × 53.98 mm, an aspect of 1.5858, with a 3.18 mm corner radius. The card
 * on screen uses the real ratio so it reads as a card and not as a rounded
 * rectangle.
 */
export const CARD_ASPECT = 85.6 / 53.98;
export const CARD_CORNER_RATIO = 3.18 / 53.98;

/**
 * Icon sizes. A separate scale from type on purpose: how heavy an icon looks
 * beside text is an optical decision, not a typographic one, and sharing one
 * scale would tie the two together for no reason.
 */
export const iconSize = {
  xs: 13,
  sm: 15,
  md: 17,
  lg: 21,
  xl: 24,
} as const;

/* ------------------------------------------------------------------ motion */

/**
 * Motion runs only on state change: a value updating, a sheet opening, a
 * request resolving. Never on screen mount — an interface that animates every
 * time you look at it feels slow, not alive.
 *
 * Durations follow Material 3's guidance that duration should scale with the
 * distance travelled: a colour swap is `fast`, a sheet crossing the screen is
 * `slow`. The odometer is the one deliberate exception, long enough to be
 * legible as a count rather than a flicker.
 */
export const motion = {
  fast: 100,
  base: 200,
  slow: 400,
  odometer: 650,
  odometerStagger: 45,
  shimmer: 1400,
} as const;

/**
 * Tab bar labels grow with the system text size up to this factor. Five labels
 * share a phone's width, so at 200% three were cut short ("Transa…"). Each
 * tab also has an icon, and screen readers read the full title, so the label
 * stops growing here instead - as the platforms' own tab bars do.
 */
export const TAB_LABEL_MAX_FONT_SCALE = 1.3;

/**
 * The display figure grows with the system text size up to this factor and no
 * further: past it a seven-digit balance no longer fits a phone's width.
 */
export const MAX_DISPLAY_FONT_SCALE = 1.6;

/**
 * Row height for text set in a fixed-height box, such as an odometer column.
 *
 * Text scales with the system font size (WCAG 2.2 1.4.4, resize text) but a
 * height computed from the unscaled size does not, so at large text the
 * digits were clipped by their own column.
 */
export function scaledLineHeight(size: number, fontScale: number, max = MAX_DISPLAY_FONT_SCALE): number {
  return Math.round(size * Math.min(Math.max(fontScale, 1), max) * 1.25);
}

/**
 * The room a text's longest word needs at the current text size, plus padding,
 * which does not grow with text.
 *
 * Android splits a word that is wider than its line, so at 200% text "New
 * transaction" became "New tran / saction" and "Platinum" "Platinu / m". Items
 * in a wrapping row given this room sit side by side while every word fits and
 * move to a line of their own once one would not.
 *
 * Give it as `flexBasis` when the row has a fixed width, as Home's rows do.
 * Inside a `flex: 1` box give it as `minWidth` with `flexBasis: 0` instead:
 * there Yoga sizes a `flexBasis` from the text's natural width, so More's
 * labels were still squeezed until "Fraud protection" split (round 7).
 */
export function wordFitBasis(wordWidth: number, fontScale: number, padding = 0): number {
  return Math.ceil(wordWidth * Math.max(fontScale, 1)) + padding;
}

/**
 * Advance widths of Inter Medium, the widest face the app sets, in em. Plain
 * text falls back to Roboto, which is narrower, so these err wide for it too.
 */
const GLYPH_EM: Record<string, number> = {
  a: 0.568, b: 0.618, c: 0.577, d: 0.618, e: 0.587, f: 0.379, g: 0.62, h: 0.602, i: 0.252, j: 0.252,
  k: 0.559, l: 0.252, m: 0.888, n: 0.602, o: 0.604, p: 0.618, q: 0.618, r: 0.387, s: 0.539, t: 0.34,
  u: 0.602, v: 0.575, w: 0.829, x: 0.557, y: 0.575, z: 0.559,
  A: 0.709, B: 0.657, C: 0.733, D: 0.722, E: 0.603, F: 0.589, G: 0.748, H: 0.745, I: 0.272, J: 0.575,
  K: 0.688, L: 0.565, M: 0.913, N: 0.756, O: 0.767, P: 0.642, Q: 0.769, R: 0.648, S: 0.646, T: 0.653,
  U: 0.74, V: 0.709, W: 1.003, X: 0.701, Y: 0.696, Z: 0.641,
  0: 0.646, 1: 0.415, 2: 0.616, 3: 0.627, 4: 0.656, 5: 0.618, 6: 0.63, 7: 0.571, 8: 0.629, 9: 0.63,
  ".": 0.303, ",": 0.303, "-": 0.462, "'": 0.313, "%": 0.993, "$": 0.646, "/": 0.37, ":": 0.303,
};
/** For a character not listed: wider than any lowercase letter, so it errs wide. */
const OTHER_GLYPH_EM = 0.9;

/**
 * A text's longest word at 100% text size, from Inter Medium's letter widths
 * plus 4% for rounding, since React Native cannot measure text before laying
 * it out. It errs wide, so a row wraps a little early, never late. A flat 0.62em
 * a letter, used first, was too wide for long words of narrow letters: it would
 * have put Profile's "Transactions" tile on a line of its own at 100%.
 */
export function longestWordWidth(text: string, size: number): number {
  const em = (word: string) => [...word].reduce((sum, ch) => sum + (GLYPH_EM[ch] ?? OTHER_GLYPH_EM), 0);
  return Math.ceil(Math.max(0, ...text.split(/\s+/).map(em)) * size * 1.04);
}

/** "Diamond", the widest level name, so the stat tiles do not move as you level up. */
export const LEVEL_NAME_WIDTH = longestWordWidth("Diamond", fontSize.body);

/**
 * Balance and sats figures. Tabular figures stop digits jittering as values
 * update, which matters because the odometer animates.
 */
export const numeric = {
  fontFamily: font.mono,
  fontVariant: ['tabular-nums'] as const,
};

/* ------------------------------------------------------------------ domain */

/** Risk bands mirror the backend's ANOMALY_THRESHOLD of 56. */
export const RISK_FLAG_THRESHOLD = 56;
export const RISK_WATCH_THRESHOLD = 30;

export const CATEGORY_ICON = {
  dining: 'utensils',
  transport: 'car',
  shopping: 'shopping-bag',
  entertainment: 'gamepad-2',
  groceries: 'carrot',
  travel: 'plane',
  health: 'heart-pulse',
  education: 'book-open',
  bills: 'file-text',
  general: 'credit-card',
} as const;

export type CategoryKey = keyof typeof CATEGORY_ICON;

export const categoryColor = (category: string): string =>
  CATEGORY_COLOR[category as CategoryKey] ?? CATEGORY_COLOR.general;

export const tierOf = (levelKey: string): (typeof TIER)[TierKey] =>
  TIER[levelKey as TierKey] ?? TIER.bronze;
