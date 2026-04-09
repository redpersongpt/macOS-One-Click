import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, AlertTriangle, AlertOctagon, X } from 'lucide-react';

export type WarningBannerVariant = 'info' | 'warning' | 'danger';

export interface WarningBannerProps {
  variant?: WarningBannerVariant;
  message: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  className?: string;
}

const config: Record<
  WarningBannerVariant,
  { icon: typeof Info; container: string; text: string; actionClass: string }
> = {
  info: {
    icon: Info,
    container: 'bg-[--color-blue-1] border-[--color-blue-3] text-[--color-blue-6]',
    text: 'text-[--color-blue-7]',
    actionClass: 'text-[--color-blue-5] hover:text-[--color-blue-6]',
  },
  warning: {
    icon: AlertTriangle,
    container: 'bg-[--color-amber-1] border-[--color-amber-3] text-[--color-amber-6]',
    text: 'text-[--color-amber-7]',
    actionClass: 'text-[--color-amber-5] hover:text-[--color-amber-6]',
  },
  danger: {
    icon: AlertOctagon,
    container: 'bg-[--color-red-1] border-[--color-red-3] text-[--color-red-6]',
    text: 'text-[--color-red-7]',
    actionClass: 'text-[--color-red-5] hover:text-[--color-red-6]',
  },
};

export function WarningBanner({
  variant = 'info',
  message,
  action,
  dismissible = false,
  className = '',
}: WarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { icon: Icon, container, text, actionClass } = config[variant];

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={[
            'flex items-start gap-3 px-4 py-3 rounded-md border',
            container,
            className,
          ].join(' ')}
          role="alert"
        >
          <Icon size={14} className="shrink-0 mt-[1px]" aria-hidden />

          <span className={`flex-1 text-[0.8125rem] leading-snug ${text}`}>
            {message}
          </span>

          <div className="flex items-center gap-3 shrink-0">
            {action && (
              <button
                onClick={action.onClick}
                className={`text-[0.75rem] font-medium underline-offset-2 hover:underline transition-colors ${actionClass}`}
              >
                {action.label}
              </button>
            )}

            {dismissible && (
              <button
                onClick={() => setDismissed(true)}
                className="text-[--text-tertiary] hover:text-[--text-secondary] transition-colors oc-focus-ring rounded"
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
