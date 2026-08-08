/**
 * BitBack theme scale.
 *
 * Every value here derives from a stated constraint so it can be defended
 * in the report. Nothing is chosen by eye.
 */

/** Modular scale, base 16, ratio 1.25. Six sizes. Adding a seventh means
 *  the hierarchy is unclear, not that you need another size. */
export const fontSize = {
  caption: 12,
  footnote: 13,
  body: 16,
  heading: 20,
  title: 25,
  display: 39,
} as const;

/** Two weights. A third weight is a decision you will not be able to justify. */
export const fontWeight = {
  regular: '400',
  medium: '500',
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

/** Apple HIG minimum is 44pt; Material 3 minimum is 48dp.
 *  Taking the larger satisfies both platforms with one number. */
export const MIN_TOUCH_TARGET = 48;

/** Balance and sats figures. Tabular figures stop digits jittering as
 *  values update, which matters because the odometer animates. */
export const numeric = {
  fontFamily: 'JetBrainsMono_500Medium',
  fontVariant: ['tabular-nums'] as const,
};

/** Motion. Only on state change: a value updating, a sheet opening.
 *  Never on screen mount. Durations from Material 3 emphasised easing. */
export const motion = {
  fast: 100,
  base: 200,
  slow: 400,
} as const;

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
