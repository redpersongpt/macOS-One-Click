import { type HTMLAttributes } from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  /** Override the accent color with a Tailwind stroke class */
  colorClass?: string;
  className?: string;
}

const dimensions: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

const strokeWidth: Record<SpinnerSize, number> = {
  sm: 2,
  md: 2,
  lg: 2.5,
};

export function Spinner({
  size = 'md',
  colorClass = 'stroke-[--accent]',
  className = '',
  ...props
}: SpinnerProps) {
  const dim = dimensions[size];
  const sw = strokeWidth[size];
  const r = (dim - sw * 2) / 2;
  const cx = dim / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-flex shrink-0 ${className}`}
      {...props}
    >
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        fill="none"
        aria-hidden
        style={{ animation: 'oc-spin 700ms linear infinite' }}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          strokeWidth={sw}
          className="stroke-[--color-gray-4]"
        />
        {/* Arc */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.75}
          className={colorClass}
          style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
        />
      </svg>
    </span>
  );
}
