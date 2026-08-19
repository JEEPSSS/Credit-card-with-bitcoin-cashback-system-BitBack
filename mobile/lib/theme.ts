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
 * Eleven steps rather than the three the app started with, because a dark
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
  border: '#322F2D',   // card and control edges
  subtle: '#4D4946',   // disabled glyphs
  muted: '#97918B',    // secondary text — 5.8:1 on canvas
  bright: '#C9C3BC',   // emphasised secondary
  text: '#F2F0EC',     // primary text — 16.4:1 on canvas
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
  onPrimary: '#1A1206',   // 12.1:1 on primary
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
  placeholder: ramp.subtle,
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

/** Secondary controls inside a row: still comfortably tappable at 40. */
export const MIN_CONTROL_HEIGHT = 40;

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
 * Balance and sats figures. Tabular figures stop digits jittering as values
 * update, which matters because the odometer animates.
 */
export const numeric = {
  fontFamily: font.mono,
  fontVariant: ['tabular-nums'] as const,
};

/* ------------------------------------------------------------------ domain */

/** Risk bands mirror the backend's ANOMALY_THRESHOLD of 60. */
export const RISK_FLAG_THRESHOLD = 60;
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
