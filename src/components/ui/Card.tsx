import React, { type HTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';

export type CardVariant = 'default' | 'elevated';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  header?: ReactNode;
  footer?: ReactNode;
  noPadding?: boolean;
  className?: string;
  children?: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default:  'bg-[--surface-1] border border-[--border-subtle]',
  elevated: 'bg-[--surface-2] border border-[--border]',
};

export function Card({
  variant = 'default',
  header,
  footer,
  noPadding = false,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={[
        'rounded-lg overflow-hidden',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...(props as unknown as React.ComponentProps<typeof motion.div>)}
    >
      {header && (
        <div className="px-4 py-3 border-b border-[--border-subtle] flex items-center">
          {header}
        </div>
      )}

      <div className={noPadding ? '' : 'p-4'}>{children}</div>

      {footer && (
        <div className="px-4 py-3 border-t border-[--border-subtle] flex items-center gap-2">
          {footer}
        </div>
      )}
    </motion.div>
  );
}

/** Lightweight non-animated card for high-frequency list items */
export function CardStatic({
  variant = 'default',
  header,
  footer,
  noPadding = false,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        'rounded-lg overflow-hidden',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {header && (
        <div className="px-4 py-3 border-b border-[--border-subtle] flex items-center">
          {header}
        </div>
      )}

      <div className={noPadding ? '' : 'p-4'}>{children}</div>

      {footer && (
        <div className="px-4 py-3 border-t border-[--border-subtle] flex items-center gap-2">
          {footer}
        </div>
      )}
    </div>
  );
}
