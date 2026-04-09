import { motion } from 'motion/react';
import { Settings2 } from 'lucide-react';
import { useWizard, STEP_ORDER, type Step } from '../../stores/wizard';
import Logo from '../Logo';

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Start',
  scan: 'Hardware',
  compatibility: 'Compatibility',
  prerequisites: 'Prerequisites',
  bios: 'BIOS',
  build: 'Build',
  review: 'Review',
  deploy: 'Deploy',
  complete: 'Done',
};

interface SidebarProps {
  onOpenSettings: () => void;
}

export default function Sidebar({ onOpenSettings }: SidebarProps) {
  const { step, completedSteps, goTo, stepIndex } = useWizard();

  return (
    <aside className="flex w-[180px] flex-col bg-[#0a0a0c] border-r border-[#151517]">
      {/* Logo */}
      <div className="flex h-11 items-center gap-2 px-4" data-tauri-drag-region>
        <Logo size={18} className="text-[#a0a0a8]" />
        <span className="text-[11px] font-semibold text-[#4a4a52] tracking-[0.08em] uppercase">OpCore</span>
      </div>

      {/* Steps */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto">
        {STEP_ORDER.map((s, idx) => {
          const isCurrent = s === step;
          const isCompleted = completedSteps.has(s);
          const isPast = idx < stepIndex();
          const isAccessible = isPast || isCurrent || isCompleted;
          const stepNum = idx + 1;

          return (
            <button
              key={s}
              onClick={() => isAccessible && goTo(s)}
              disabled={!isAccessible}
              className={`relative flex w-full items-center gap-2 rounded-[5px] px-2 py-[6px] text-[11.5px] transition-all duration-150 mb-[1px] ${
                isCurrent
                  ? 'text-[#f0f0f2] font-medium'
                  : isAccessible
                    ? 'text-[#5a5a62] hover:text-[#8a8a92]'
                    : 'text-[#2a2a30] cursor-not-allowed'
              }`}
            >
              {/* Active indicator bar */}
              {isCurrent && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-[5px] bg-[#141416] border border-[#1e1e22]"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <span className={`relative z-10 w-3.5 text-center text-[10px] tabular-nums ${
                isCompleted && !isCurrent ? 'text-[#22c55e]' : isCurrent ? 'text-[#3b82f6]' : ''
              }`}>
                {isCompleted && !isCurrent ? '\u2713' : stepNum}
              </span>
              <span className="relative z-10">{STEP_LABELS[s]}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-2">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-[#1e1e22] to-transparent mb-2" />
        <div className="flex items-center justify-between">
          <button
            onClick={onOpenSettings}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#5a5a62] transition-colors hover:bg-[#141416] hover:text-[#dadadf]"
            aria-label="Open settings"
            title="Settings"
          >
            <Settings2 size={13} />
          </button>
          <span className="text-[9px] text-[#2a2a30] tracking-wide">v5.0.0</span>
        </div>
      </div>
    </aside>
  );
}
