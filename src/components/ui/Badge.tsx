import React, { type HTMLAttributes } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-[--color-green-1] text-[--color-green-6] border border-[--color-green-3]',
  warning: 'bg-[--color-amber-1] text-[--color-amber-6] border border-[--color-amber-3]',
  danger:  'bg-[--color-red-1]   text-[--color-red-6]   border border-[--color-red-3]',
  info:    'bg-[--color-blue-1]  text-[--color-blue-6]  border border-[--color-blue-3]',
  neutral: 'bg-[--surface-2]     text-[--text-secondary] border border-[--border]',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-[--color-green-5]',
  warning: 'bg-[--color-amber-5]',
  danger:  'bg-[--color-red-5]',
  info:    'bg-[--color-blue-5]',
  neutral: 'bg-[--color-gray-6]',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[0.625rem] gap-1 leading-none',
  md: 'px-2 py-1 text-[0.6875rem] gap-1.5 leading-none',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded font-medium tracking-wide uppercase',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {dot && (
        <span
          className={`inline-block rounded-full shrink-0 ${dotColors[variant]} ${size === 'sm' ? 'size-1' : 'size-1.5'}`}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
