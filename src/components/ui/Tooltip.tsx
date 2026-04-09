import {
  useState,
  useRef,
  useCallback,
  type ReactNode,
  type HTMLAttributes,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: ReactNode;
  position?: TooltipPosition;
  /** Delay before showing in ms */
  delay?: number;
  children: ReactNode;
}

const positionClasses: Record<TooltipPosition, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

const initialMotion: Record<TooltipPosition, { x?: number; y?: number }> = {
  top:    { y: 4 },
  bottom: { y: -4 },
  left:   { x: 4 },
  right:  { x: -4 },
};

export function Tooltip({
  content,
  position = 'top',
  delay = 200,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      <AnimatePresence>
        {visible && content && (
          <motion.span
            key="tooltip"
            role="tooltip"
            initial={{ opacity: 0, ...initialMotion[position] }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, ...initialMotion[position] }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={[
              'absolute z-50 pointer-events-none',
              'px-2 py-1 rounded',
              'bg-[--color-gray-4] text-[--text-primary]',
              'text-[0.6875rem] font-medium leading-snug whitespace-nowrap',
              'border border-[--border]',
              positionClasses[position],
            ].join(' ')}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
