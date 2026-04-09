import { motion } from 'motion/react';
import { Spinner } from '../ui/Spinner';

export interface LoadingStateProps {
  message?: string;
  /** Fill the full viewport */
  fullscreen?: boolean;
  className?: string;
}

export function LoadingState({
  message,
  fullscreen = false,
  className = '',
}: LoadingStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={[
        'flex flex-col items-center justify-center gap-3',
        fullscreen ? 'fixed inset-0 z-40 bg-[--surface-background]' : 'py-16',
        className,
      ].join(' ')}
    >
      <Spinner size="md" />

      {message && (
        <p className="text-[0.8125rem] text-[--text-tertiary] leading-normal">
          {message}
        </p>
      )}
    </motion.div>
  );
}
