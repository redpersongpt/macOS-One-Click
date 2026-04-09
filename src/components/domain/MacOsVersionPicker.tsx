import { motion } from 'motion/react';
import { Check } from 'lucide-react';

/**
 * macOS version metadata with Apple‑grade branding.
 * Gradient pairs are sourced from each release's actual wallpaper palette.
 */
const MAC_OS_VERSIONS: Record<
  string,
  { name: string; version: number; gradient: [string, string]; emoji: string }
> = {
  'Big Sur':    { name: 'Big Sur',    version: 11, gradient: ['#1b6ff4', '#60c5f1'], emoji: '🏔️' },
  'Monterey':   { name: 'Monterey',   version: 12, gradient: ['#0e2960', '#5b88cc'], emoji: '🌊' },
  'Ventura':    { name: 'Ventura',    version: 13, gradient: ['#e8c547', '#d98324'], emoji: '🌅' },
  'Sonoma':     { name: 'Sonoma',     version: 14, gradient: ['#b55ae3', '#4d2f7c'], emoji: '🍇' },
  'Sequoia':    { name: 'Sequoia',    version: 15, gradient: ['#1a8a5f', '#0f4c3a'], emoji: '🌲' },
  'Tahoe':      { name: 'Tahoe',      version: 26, gradient: ['#2da8e0', '#1a5276'], emoji: '🏞️' },
};

function normalize(value: string): string {
  return value.replace(/^macos\s+/i, '').replace(/\s+\d+$/, '');
}

interface MacOsVersionPickerProps {
  versions: string[];
  selected: string | null;
  recommended?: string;
  onSelect: (version: string) => void;
}

export function MacOsVersionPicker({
  versions,
  selected,
  recommended,
  onSelect,
}: MacOsVersionPickerProps) {
  if (versions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-wide text-[--text-tertiary] mb-0.5">
        Target macOS
      </p>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(versions.length, 3)}, 1fr)` }}>
        {versions.map((v, i) => {
          const key = normalize(v);
          const meta = MAC_OS_VERSIONS[key];
          const isSelected = selected === v;
          const isRecommended = recommended === v;

          return (
            <motion.button
              key={v}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.22 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(v)}
              className={[
                'relative flex flex-col items-center rounded-xl px-3 py-3.5 cursor-pointer transition-all duration-150 overflow-hidden',
                isSelected
                  ? 'ring-2 ring-[--accent] bg-[--surface-2]'
                  : 'ring-1 ring-[--border-subtle] bg-[--surface-1] hover:ring-[--border]',
              ].join(' ')}
            >
              {/* Gradient orb — Apple wallpaper homage */}
              <div
                className="w-11 h-11 rounded-2xl mb-2.5 flex items-center justify-center shadow-lg"
                style={{
                  background: meta
                    ? `linear-gradient(135deg, ${meta.gradient[0]}, ${meta.gradient[1]})`
                    : 'linear-gradient(135deg, #3b3b3f, #1f1f23)',
                }}
              >
                <span className="text-lg select-none" aria-hidden>
                  {meta?.emoji ?? '💻'}
                </span>
              </div>

              <span className="text-[12px] font-medium text-[--text-primary] leading-tight">
                {key}
              </span>
              <span className="text-[10px] text-[--text-tertiary] mt-0.5 tabular-nums">
                {meta ? `macOS ${meta.version}` : v}
              </span>

              {isRecommended && !isSelected && (
                <span className="mt-1.5 text-[9px] uppercase tracking-wider text-[--accent] font-semibold">
                  Recommended
                </span>
              )}

              {/* Check badge */}
              {isSelected && (
                <motion.div
                  className="absolute top-1.5 right-1.5 w-4.5 h-4.5 rounded-full bg-[--accent] flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  <Check size={10} className="text-white" strokeWidth={3} />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
