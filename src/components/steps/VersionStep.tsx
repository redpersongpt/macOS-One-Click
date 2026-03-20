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
}

export default function VersionStep({
  report,
  matrix,
  selectedVersion,
  planningMode,
  onPlanningModeChange,
  onSelect,
}: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-bold text-white mb-2">Choose macOS</h2>
        <p className="text-[#888888] font-medium text-sm">
          Every target is shown here. Supported, Experimental, and Risky paths remain selectable for planning, while truly blocked versions stay unselectable.
        </p>
      </div>

      <PlanningModeToggle mode={planningMode} onChange={onPlanningModeChange} />

      <div className={`rounded-2xl border p-4 text-xs leading-relaxed ${
        planningMode === 'safe'
          ? 'border-blue-500/15 bg-blue-500/6 text-blue-100/75'
          : 'border-amber-500/20 bg-amber-500/8 text-amber-100/75'
      }`}>
        {planningMode === 'safe'
          ? 'Safe Mode keeps the recommendation anchored to the highest-confidence supported or experimental target first. Risky rows are still visible, but they are presented as advanced planning paths rather than the default starting point.'
          : 'Exploratory Mode keeps the same hard blockers, but it highlights riskier non-blocked targets as stretch candidates and shows more aggressive tuning ideas in the report.'}
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
