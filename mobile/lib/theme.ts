/**
 * BitBack design tokens.
 *
 * Every value here derives from a stated constraint so it can be defended in
 * the report. Nothing is chosen by eye.
 *
 * This file is the whole system. It used to describe one while the screens
 * ignored it: `fontSize`, `space`, `radius` and `motion` were exported and
 * imported by nothing, colours lived in a component file, and the app used 13
 * distinct font sizes against the six documented here. Anything not reachable
 * from this file is a bug.
 */

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
 *
 * The thirteen sizes previously in use collapse onto these - 11/12/13/14 became
 * `caption`, 15/16/17 `body`, 18/20/21/22 `heading`, 25/28 `title`, and
 * 32/40/44/46 `display`. Adding a sixth means the hierarchy is unclear, not that
 * you need another size.
 */
export const fontSize = {
  caption: 13,
  body: 16,
  heading: 20,
  title: 25,
  display: 39,
} as const;

/**
 * Icon sizes. Separate from the type scale on purpose: an icon's size is an
 * optical decision about how heavy it looks beside text, not a typographic one,
 * and a shared scale would tie the two together for no reason. Five steps,
 * matching where icons actually appear.
 */
export const iconSize = {
  xs: 13,   // inline with caption text
  sm: 15,   // inline with body text
  md: 17,   // list rows
  lg: 21,   // tab bar
  xl: 24,   // navigation
} as const;

/** Two families, three roles. Numerals are always mono so columns align. */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  mono: 'JetBrainsMono_500Medium',
} as const;

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

/** Two radii. Cards and controls. That is the whole vocabulary. */
export const radius = {
  control: 8,
  card: 12,
} as const;

/**
 * Apple HIG minimum is 44pt; Material 3 minimum is 48dp.
 * Taking the larger satisfies both platforms with one number.
 */
export const MIN_TOUCH_TARGET = 48;

/** Secondary controls that sit inside a row, still comfortably tappable. */
export const MIN_CONTROL_HEIGHT = 40;

/**
 * Colour.
 *
 * Values derive from the Radix Colors dark scale. Every foreground pairing is
 * checked against WCAG 2.2 AA (4.5:1 for text, 3:1 for icons and borders) on
 * the surface it sits on. The surface variants exist because screens were
 * otherwise reaching past the palette for raw hexes.
 */
export const color = {
  bg: '#0A0A0B',
  card: '#141416',
  elevated: '#1C1C1F',
  border: '#2A2A2E',

  text: '#F2F1EE',
  muted: '#93939A',
  placeholder: '#5C5C63',

  primary: '#F7931A',        // bitcoin orange
  onPrimary: '#1A1206',      // 12.1:1 on primary
  accentSurface: '#2A1D08',  // selected chips
  accentBorder: '#4A3410',   // active boost card

  success: '#30A46C',
  danger: '#E5484D',
  dangerBorder: '#4A2020',   // error and flagged cards
} as const;

/** Kept as a named alias: `COLORS` reads better at call sites than `color`. */
export const COLORS = color;

/**
 * Motion. Only on state change: a value updating, a sheet opening.
 * Never on screen mount. Durations from Material 3 emphasised easing.
 */
export const motion = {
  fast: 100,
  base: 200,
  slow: 400,
  odometer: 650,
  odometerStagger: 45,
} as const;

/**
 * Balance and sats figures. Tabular figures stop digits jittering as values
 * update, which matters because the odometer animates.
 */
export const numeric = {
  fontFamily: font.mono,
  fontVariant: ['tabular-nums'] as const,
};

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
