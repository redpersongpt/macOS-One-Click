/**
 * OpCore-OneClick — Spacing Scale
 * 4px base unit. Named scale for consistent rhythm.
 */

export const spacing = {
  /** 4px */
  space1: '0.25rem',
  /** 8px */
  space2: '0.5rem',
  /** 12px */
  space3: '0.75rem',
  /** 16px */
  space4: '1rem',
  /** 20px */
  space5: '1.25rem',
  /** 24px */
  space6: '1.5rem',
  /** 32px */
  space7: '2rem',
  /** 40px */
  space8: '2.5rem',
  /** 48px */
  space9: '3rem',
  /** 64px */
  space10: '4rem',
  /** 80px */
  space11: '5rem',
  /** 96px */
  space12: '6rem',
} as const;

export type SpacingToken = keyof typeof spacing;
