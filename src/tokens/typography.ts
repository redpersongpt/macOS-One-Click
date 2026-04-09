/**
 * OpCore-OneClick — Typography Scale
 * Inter for UI text. JetBrains Mono for metrics and code.
 */

export const fontFamily = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
  mono: '"JetBrains Mono", "SF Mono", "Menlo", "Monaco", monospace',
} as const;

export const fontSize = {
  /** 11px — captions, labels, badges */
  xs: '0.6875rem',
  /** 12px — secondary labels, helper text */
  sm: '0.75rem',
  /** 13px — compact UI text */
  base: '0.8125rem',
  /** 14px — body text */
  md: '0.875rem',
  /** 15px — slightly emphasized body */
  lg: '0.9375rem',
  /** 16px — section headings */
  xl: '1rem',
  /** 18px — card headings */
  '2xl': '1.125rem',
  /** 20px — page headings */
  '3xl': '1.25rem',
  /** 24px — hero text */
  '4xl': '1.5rem',
  /** 28px — display text */
  '5xl': '1.75rem',
} as const;

export const lineHeight = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const letterSpacing = {
  tight: '-0.02em',
  normal: '0',
  wide: '0.02em',
  wider: '0.05em',
  widest: '0.08em',
} as const;

export const typography = {
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
} as const;
