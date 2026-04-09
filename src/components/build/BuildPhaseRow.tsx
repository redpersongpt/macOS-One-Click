import { CheckCircle2, Download, Package, FileCode, ShieldCheck } from 'lucide-react';

const phaseConfig: Record<string, { icon: typeof Download; label: string }> = {
  opencore: { icon: Download, label: 'Downloading OpenCore' },
  kexts: { icon: Package, label: 'Downloading Kexts' },
  config: { icon: FileCode, label: 'Generating Config' },
  validate: { icon: ShieldCheck, label: 'Validating' },
};

interface BuildPhaseRowProps {
  phase: string;
  active: boolean;
  completed: boolean;
  message?: string;
}

export function BuildPhaseRow({ phase, active, completed, message }: BuildPhaseRowProps) {
  const meta = phaseConfig[phase];
  if (!meta) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="shrink-0">
        {completed ? (
          <CheckCircle2 size={15} className="text-[--color-green-5]" />
        ) : active ? (
          <span className="relative flex size-[15px] items-center justify-center">
            <span className="absolute size-full rounded-full bg-[--accent] opacity-30 animate-ping" />
            <span className="relative size-2 rounded-full bg-[--accent]" />
          </span>
        ) : (
          <span className="block size-[15px] rounded-full border border-[--border] bg-transparent" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[0.8125rem] leading-snug ${
            active
              ? 'text-[--text-primary] font-medium'
              : completed
                ? 'text-[--text-secondary]'
                : 'text-[--text-tertiary]'
          }`}
        >
          {meta.label}
        </p>
        {active && message && (
          <p className="text-[0.6875rem] text-[--text-tertiary] mt-0.5 truncate">{message}</p>
        )}
      </div>
    </div>
  );
}
