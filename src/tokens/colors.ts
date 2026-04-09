/**
 * OpCore-OneClick — Color Token System
 * Dark-first. Restrained. No gamer aesthetics.
 */

export const gray = {
  /** True near-black — window/app background */
  gray1: '#09090b',
  /** Slightly lifted — primary surface */
  gray2: '#111113',
  /** Raised surface — cards, panels */
  gray3: '#1a1a1d',
  /** Borders, dividers */
  gray4: '#27272a',
  /** Subtle interactive borders */
  gray5: '#3f3f46',
  /** Muted text, placeholders */
  gray6: '#52525b',
  /** Secondary text */
  gray7: '#71717a',
  /** Tertiary text */
  gray8: '#a1a1aa',
  /** Secondary foreground */
  gray9: '#d4d4d8',
  /** Primary foreground */
  gray10: '#e4e4e7',
  /** Bright text — headings, emphasis */
  gray11: '#f0f0f2',
  /** Pure white — maximum contrast only */
  gray12: '#ffffff',
} as const;

export const blue = {
  /** Deepest accent bg */
  blue1: '#0c1525',
  /** Subtle tint */
  blue2: '#111d35',
  /** Active bg states */
  blue3: '#172554',
  /** Borders on blue surfaces */
  blue4: '#1d4ed8',
  /** Default accent */
  blue5: '#3b82f6',
  /** Hover state */
  blue6: '#60a5fa',
  /** Active / pressed */
  blue7: '#93c5fd',
  /** Foreground on dark blue bg */
  blue8: '#bfdbfe',
} as const;

export const green = {
  green1: '#0a1f14',
  green2: '#14532d',
  green3: '#166534',
  green4: '#15803d',
  green5: '#22c55e',
  green6: '#4ade80',
  green7: '#86efac',
} as const;

export const amber = {
  amber1: '#1c1200',
  amber2: '#451a03',
  amber3: '#78350f',
  amber4: '#92400e',
  amber5: '#f59e0b',
  amber6: '#fbbf24',
  amber7: '#fde68a',
} as const;

export const red = {
  red1: '#1f0a0a',
  red2: '#450a0a',
  red3: '#7f1d1d',
  red4: '#991b1b',
  red5: '#ef4444',
  red6: '#f87171',
  red7: '#fca5a5',
} as const;

/** Semantic surface colors */
export const surface = {
  background: gray.gray1,
  surface1: gray.gray2,
  surface2: gray.gray3,
  border: gray.gray4,
  borderSubtle: gray.gray3,
  borderStrong: gray.gray5,
} as const;

/** Semantic text colors */
export const text = {
  primary: gray.gray11,
  secondary: gray.gray8,
  tertiary: gray.gray6,
  disabled: gray.gray5,
  inverse: gray.gray1,
  accent: blue.blue5,
} as const;

/** Semantic accent */
export const accent = {
  default: blue.blue5,
  hover: blue.blue6,
  active: blue.blue4,
  subtle: blue.blue2,
  border: blue.blue3,
} as const;

/** Semantic status colors */
export const status = {
  success: green.green5,
  successSubtle: green.green1,
  successBorder: green.green3,
  successText: green.green6,

  warning: amber.amber5,
  warningSubtle: amber.amber1,
  warningBorder: amber.amber3,
  warningText: amber.amber6,

  danger: red.red5,
  dangerSubtle: red.red1,
  dangerBorder: red.red3,
  dangerText: red.red6,

  info: blue.blue5,
  infoSubtle: blue.blue1,
  infoBorder: blue.blue3,
  infoText: blue.blue6,
} as const;

export const colors = {
  gray,
  blue,
  green,
  amber,
  red,
  surface,
  text,
  accent,
  status,
} as const;
