import React from 'react';
import type { CompatibilityPlanningMode } from '../../electron/compatibility';

interface PlanningModeToggleProps {
  mode: CompatibilityPlanningMode;
  onChange: (mode: CompatibilityPlanningMode) => void;
}

const MODE_COPY: Record<CompatibilityPlanningMode, { title: string; detail: string }> = {
  safe: {
    title: 'Safe Mode',
    detail: 'Default. Prefer conservative recommendations and the highest-confidence community paths first.',
  },
  exploratory: {
    title: 'Exploratory Mode',
    detail: 'Show stretch-target guidance and riskier tuning ideas without changing destructive safety or write authority.',
  },
};

export default function PlanningModeToggle({ mode, onChange }: PlanningModeToggleProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">
            Planning Mode
          </div>
          <div className="text-[11px] text-white/55 mt-1">
            Changes guidance and recommendations only. Flash, restore, backup, BIOS, and write safety stay identical.
          </div>
        </div>
        <div className="inline-flex rounded-xl border border-white/8 bg-black/20 p-1">
          {(['safe', 'exploratory'] as const).map((value) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onChange(value)}
                className={`px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-500/18 text-blue-200 border border-blue-400/30'
                    : 'text-white/55 hover:text-white hover:bg-white/6 border border-transparent'
                }`}
              >
                {MODE_COPY[value].title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[11px] text-white/58 leading-relaxed">
        {MODE_COPY[mode].detail}
      </div>
    </div>
  );
}
