import { type HTMLAttributes } from 'react';

export type ProgressVariant = 'accent' | 'success' | 'warning' | 'danger';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  indeterminate?: boolean;
  variant?: ProgressVariant;
  /** Bar height in px — default 2 */
  height?: number;
  /** Accessible label */
  label?: string;
  className?: string;
}

const variantTrack: Record<ProgressVariant, string> = {
  accent:  'bg-[--color-gray-4]',
  success: 'bg-[--color-gray-4]',
  warning: 'bg-[--color-gray-4]',
  danger:  'bg-[--color-gray-4]',
};

const variantFill: Record<ProgressVariant, string> = {
  accent:  'bg-[--accent]',
  success: 'bg-[--color-green-5]',
  warning: 'bg-[--color-amber-5]',
  danger:  'bg-[--color-red-5]',
};

export function Progress({
  value = 0,
  indeterminate = false,
  variant = 'accent',
  height = 2,
  label,
  className = '',
  ...props
}: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={[
        'relative w-full overflow-hidden rounded-full',
        variantTrack[variant],
        className,
      ].join(' ')}
      style={{ height: `${height}px` }}
      {...props}
    >
      {indeterminate ? (
        <>
          {/* Primary indeterminate bar */}
          <span
            className={`absolute top-0 bottom-0 ${variantFill[variant]}`}
            style={{
              animation: 'oc-indeterminate 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite',
            }}
          />
          {/* Short trailing bar */}
          <span
            className={`absolute top-0 bottom-0 ${variantFill[variant]}`}
            style={{
              animation: 'oc-indeterminate-short 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) 1.15s infinite',
            }}
          />
        </>
      ) : (
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out ${variantFill[variant]}`}
          style={{ width: `${clampedValue}%` }}
        />
      )}
    </div>
  );
}
