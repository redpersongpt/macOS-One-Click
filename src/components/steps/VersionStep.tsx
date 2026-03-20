import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import type {
  CompatibilityPlanningMode,
  CompatibilityReport,
} from '../../../electron/compatibility';
import type { CompatibilityMatrix } from '../../../electron/compatibilityMatrix';
import CompatibilityMatrixView from '../CompatibilityMatrix';
import PlanningModeToggle from '../PlanningModeToggle';

interface Props {
  report: CompatibilityReport;
  matrix: CompatibilityMatrix;
  selectedVersion: string;
  planningMode: CompatibilityPlanningMode;
  onPlanningModeChange: (mode: CompatibilityPlanningMode) => void;
  onSelect: (version: string) => void;
  onUseRecommendedVersion?: () => void;
}

export default function VersionStep({
  report,
  matrix,
  selectedVersion,
  planningMode,
  onPlanningModeChange,
  onSelect,
  onUseRecommendedVersion,
}: Props) {
  const selectedRow = matrix.rows.find((row) => row.versionName === selectedVersion) ?? null;
  const recommendedRow = matrix.rows.find((row) => row.versionName === matrix.recommendedVersion) ?? null;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-4xl font-bold text-white mb-2">Choose macOS</h2>
        <p className="text-[#888888] font-medium text-sm">
          Pick the calmest viable macOS target first. Recommended paths stand out immediately, while blocked versions stay readable but unavailable.
        </p>
      </div>

      <PlanningModeToggle mode={planningMode} onChange={onPlanningModeChange} />

      <div className={`rounded-2xl border p-4 text-xs leading-relaxed ${
        planningMode === 'safe'
          ? 'border-blue-500/15 bg-blue-500/6 text-blue-100/75'
          : 'border-amber-500/20 bg-amber-500/8 text-amber-100/75'
      }`}>
        {planningMode === 'safe'
          ? 'Safe Mode keeps the first recommendation anchored to the calmest supported or experimental path.'
          : 'Exploratory Mode keeps the same hard blockers, but it gives risky paths more room in the shortlist.'}
      </div>

      {report.warnings.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-1.5">
          {report.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-400/80">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {!report.isCompatible && (
        <div className="p-5 rounded-2xl bg-red-500/8 border border-red-500/20 text-sm text-red-300/80">
          {report.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {selectedRow?.status === 'blocked' && recommendedRow && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-5 space-y-3">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300/75">
            Selected Version Blocked
          </div>
          <p className="text-sm leading-relaxed text-white/80">
            {selectedRow.reason}
          </p>
          <p className="text-sm leading-relaxed text-white/60">
            Best usable alternative: <span className="font-bold text-white">{recommendedRow.versionName}</span>
          </p>
          {onUseRecommendedVersion && (
            <button
              onClick={onUseRecommendedVersion}
              className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition-all hover:bg-amber-400"
            >
              Use Recommended Version
            </button>
          )}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <CompatibilityMatrixView
          rows={matrix.rows}
          selectedVersion={selectedVersion}
          planningMode={planningMode}
          onSelect={onSelect}
        />
      </motion.div>
    </div>
  );
}
