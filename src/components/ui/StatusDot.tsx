import { type HTMLAttributes } from 'react';

export type StatusDotColor = 'green' | 'yellow' | 'red' | 'gray' | 'blue';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  color?: StatusDotColor;
  pulse?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const colorClasses: Record<StatusDotColor, string> = {
  green:  'bg-[--color-green-5]',
  yellow: 'bg-[--color-amber-5]',
  red:    'bg-[--color-red-5]',
  gray:   'bg-[--color-gray-6]',
  blue:   'bg-[--color-blue-5]',
};

const pulseColorClasses: Record<StatusDotColor, string> = {
  green:  'bg-[--color-green-5]',
  yellow: 'bg-[--color-amber-5]',
  red:    'bg-[--color-red-5]',
  gray:   'bg-[--color-gray-6]',
  blue:   'bg-[--color-blue-5]',
};

const sizeClasses = {
  sm: 'size-1.5',
  md: 'size-2',
};

export function StatusDot({
  color = 'gray',
  pulse = false,
  size = 'md',
  className = '',
  ...props
}: StatusDotProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 ${sizeClasses[size]} ${className}`}
      aria-hidden
      {...props}
    >
      {pulse && (
        <span
          className={`absolute inline-flex size-full rounded-full opacity-75 ${pulseColorClasses[color]}`}
          style={{ animation: 'oc-pulse 2s ease-in-out infinite' }}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${sizeClasses[size]} ${colorClasses[color]}`}
      />
    </span>
  );
}
