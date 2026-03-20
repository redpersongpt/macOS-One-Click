import React from 'react';
import { AlertTriangle, CheckCircle, ChevronRight, Info, ShieldAlert } from 'lucide-react';
import type { CompatibilityMatrixRow } from '../../electron/compatibilityMatrix';
import type { CompatibilityPlanningMode } from '../../electron/compatibility';

interface CompatibilityMatrixProps {
  rows: CompatibilityMatrixRow[];
  selectedVersion?: string | null;
  onSelect?: (version: string) => void;
  planningMode?: CompatibilityPlanningMode;
}

const STATUS_STYLE: Record<CompatibilityMatrixRow['status'], {
  label: string;
  icon: React.ReactNode;
  badgeClassName: string;
  cardClassName: string;
  disabled: boolean;
}> = {
  supported: {
    label: 'Supported',
    icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
    badgeClassName: 'bg-emerald-500/12 border-emerald-500/20 text-emerald-300',
    cardClassName: 'border-emerald-500/18 bg-emerald-500/6',
    disabled: false,
  },
  experimental: {
    label: 'Experimental',
    icon: <Info className="w-3.5 h-3.5 text-sky-400" />,
    badgeClassName: 'bg-sky-500/12 border-sky-500/20 text-sky-300',
    cardClassName: 'border-sky-500/16 bg-sky-500/5',
    disabled: false,
  },
  risky: {
    label: 'Risky',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
    badgeClassName: 'bg-amber-500/12 border-amber-500/20 text-amber-300',
    cardClassName: 'border-amber-500/16 bg-amber-500/5',
    disabled: false,
  },
  blocked: {
    label: 'Blocked',
    icon: <ShieldAlert className="w-3.5 h-3.5 text-red-400" />,
    badgeClassName: 'bg-red-500/12 border-red-500/20 text-red-300',
    cardClassName: 'border-red-500/16 bg-red-500/5',
    disabled: true,
  },
};

function getVersionVisual(versionName: string): {
  gradient: string;
  accent: string;
  label: string;
} {
  const normalized = versionName.toLowerCase();
  if (normalized.includes('tahoe')) {
    return {
      gradient: 'from-[#1c3b70] via-[#2f74c0] to-[#b1d9ff]',
      accent: 'bg-blue-300/70',
      label: 'Tahoe',
    };
  }
  if (normalized.includes('sequoia')) {
    return {
      gradient: 'from-[#16305a] via-[#3f6fb3] to-[#8cc7ff]',
      accent: 'bg-cyan-200/75',
      label: 'Sequoia',
    };
  }
  if (normalized.includes('sonoma')) {
    return {
      gradient: 'from-[#41175c] via-[#9153d4] to-[#f3a4d5]',
      accent: 'bg-fuchsia-200/75',
      label: 'Sonoma',
    };
  }
  if (normalized.includes('ventura')) {
    return {
      gradient: 'from-[#371d6a] via-[#4b7fd9] to-[#ff9bc2]',
      accent: 'bg-indigo-200/75',
      label: 'Ventura',
    };
  }
  if (normalized.includes('monterey')) {
    return {
      gradient: 'from-[#62214d] via-[#d5678b] to-[#ffcf95]',
      accent: 'bg-rose-200/75',
      label: 'Monterey',
    };
  }
  if (normalized.includes('big sur')) {
    return {
      gradient: 'from-[#144175] via-[#31a1d5] to-[#7df2ff]',
      accent: 'bg-sky-200/75',
      label: 'Big Sur',
    };
  }
  return {
    gradient: 'from-[#2c3142] via-[#5c6784] to-[#d8dde8]',
    accent: 'bg-slate-200/70',
    label: 'macOS',
  };
}

export default function CompatibilityMatrix({
  rows,
  selectedVersion,
  onSelect,
  planningMode = 'safe',
}: CompatibilityMatrixProps) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const style = STATUS_STYLE[row.status];
        const visual = getVersionVisual(row.versionName);
        const selected = selectedVersion === row.versionName;
        const interactive = !!onSelect && !style.disabled;
        const content = (
          <div className={`rounded-[28px] border p-4 md:p-5 transition-all ${style.cardClassName} ${row.recommended ? 'shadow-[0_18px_50px_rgba(37,99,235,0.12)]' : ''} ${selected ? 'ring-1 ring-blue-400/40 border-blue-400/35 shadow-[0_0_0_1px_rgba(96,165,250,0.15)]' : 'border-white/8'} ${interactive ? 'hover:border-white/20 hover:bg-white/6' : ''}`}>
            <div className="grid gap-4 md:grid-cols-[220px,1fr] md:items-center">
              <div className={`relative overflow-hidden rounded-[22px] border border-white/10 p-3 ${row.status === 'blocked' ? 'opacity-75 saturate-50' : ''}`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${visual.gradient}`} />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.26),transparent_38%)]" />
                <div className="absolute inset-x-0 top-0 h-1.5 bg-white/12" />
                <div className="relative flex h-full min-h-[156px] flex-col justify-between rounded-[18px] border border-white/10 bg-black/12 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">macOS</div>
                    <div className={`h-2.5 w-2.5 rounded-full ${visual.accent}`} />
                  </div>
                  <div>
                    <div className="text-2xl font-black tracking-tight text-white">
                      {row.versionName.replace(/^macOS\s+/i, '')}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                      {visual.label}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/70">
                    {row.status === 'supported'
                      ? 'Best first build'
                      : row.status === 'experimental'
                      ? 'Tweak-aware path'
                      : row.status === 'risky'
                      ? 'Manual fixes likely'
                      : 'Readable but unavailable'}
                  </div>
                </div>
              </div>

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-bold text-white">{row.versionName}</div>
                  {row.recommended && (
                    <span className="px-2.5 py-1 rounded-full bg-blue-500/18 border border-blue-400/28 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">
                      {planningMode === 'safe' ? 'Recommended' : 'Best Exploratory Start'}
                    </span>
                  )}
                  {row.status === 'risky' && (
                    <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest ${
                      planningMode === 'exploratory'
                        ? 'bg-amber-500/15 border-amber-500/25 text-amber-200'
                        : 'bg-white/6 border-white/10 text-white/55'
                    }`}>
                      {planningMode === 'exploratory' ? 'Exploratory Candidate' : 'Advanced Only'}
                    </span>
                  )}
                  {selected && (
                    <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[9px] font-bold uppercase tracking-widest text-white/70">
                      Selected
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest ${style.badgeClassName}`}>
                    {style.icon}
                    {style.label}
                  </div>
                  {row.recommended && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/6 text-[10px] font-bold uppercase tracking-widest text-white/55">
                      Start Here
                    </div>
                  )}
                </div>

                <div className="mt-4 text-sm leading-relaxed text-white/72">
                  {row.reason}
                </div>

                <div className="mt-3 text-[11px] leading-relaxed text-white/45">
                  {row.status === 'blocked'
                    ? 'This target remains blocked. Pick the recommended alternative instead of forcing this version.'
                    : row.status === 'supported'
                    ? 'This is the cleanest path for a first build on this hardware.'
                    : row.status === 'experimental'
                    ? 'This path is community-realistic, but it may want older macOS ceilings or extra firmware tuning.'
                    : 'This path is for advanced users. Expect manual fixes before it feels reliable.'}
                </div>
              </div>
            </div>
          </div>
        );

        if (!onSelect) {
          return <div key={row.versionId}>{content}</div>;
        }

        return (
          <button
            key={row.versionId}
            type="button"
            disabled={style.disabled}
            onClick={() => onSelect(row.versionName)}
            className={`group w-full text-left ${style.disabled ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'}`}
          >
            <div className="relative">
              {content}
              {interactive && (
                <ChevronRight className="absolute right-5 top-5 w-4 h-4 text-white/25 group-hover:text-white/70 transition-colors" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
