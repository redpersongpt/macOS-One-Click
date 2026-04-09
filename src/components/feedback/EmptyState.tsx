import { type ReactNode } from 'react';
import { motion } from 'motion/react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={[
        'flex flex-col items-center justify-center text-center',
        'py-16 px-6 gap-3',
        className,
      ].join(' ')}
    >
      {icon && (
        <span className="text-[--text-tertiary] mb-1" aria-hidden>
          {icon}
        </span>
      )}

      <p className="text-[0.875rem] font-semibold text-[--text-primary] leading-snug">
        {title}
      </p>

      {description && (
        <p className="text-[0.8125rem] text-[--text-tertiary] leading-normal max-w-xs">
          {description}
        </p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}
