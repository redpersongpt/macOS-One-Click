import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle, XCircle, Info, ChevronDown, ChevronRight, Eye, Download, Save, Upload, FlaskConical } from 'lucide-react';
import { HardwareProfile } from '../../../electron/configGenerator';
import type { CompatibilityReport } from '../../../electron/compatibility';
import {
  getBestSupportedGpuPath,
  getProfileGpuDevices,
  hasUnsupportedDiscreteGpu,
  parseMacOSVersion,
} from '../../../electron/hackintoshRules.js';
import type { HardwareInterpretation, InterpretedFact } from '../../../electron/hardwareInterpret';
import type { HardwareProfileArtifact } from '../../../electron/hardwareProfileArtifact';
import type { CompatibilityMatrix } from '../../../electron/compatibilityMatrix';
import type { ResourcePlan } from '../../../electron/resourcePlanner';
import type { SafeSimulationResult } from '../../../electron/safeSimulation';
import CompatibilitySummary from '../CompatibilitySummary';
import CompatibilityMatrixView from '../CompatibilityMatrix';
import ResourcePlanPanel from '../ResourcePlanPanel';
import SimulationPreview from '../SimulationPreview';

interface ReportStepProps {
  profile: HardwareProfile;
  report: CompatibilityReport;
  matrix: CompatibilityMatrix;
  interpretation: HardwareInterpretation | null;
  profileArtifact: HardwareProfileArtifact | null;
  resourcePlan: ResourcePlan | null;
  planningOnly: boolean;
  planningProfileContext: 'live_scan' | 'imported_artifact' | 'saved_artifact' | null;
  simulationResult: SafeSimulationResult | null;
  simulationRunning: boolean;
  onSaveProfile: () => Promise<void> | void;
  onExportProfile: () => Promise<void> | void;
  onImportProfile: () => Promise<void> | void;
  onRunSimulation: () => Promise<void> | void;
  onRunLiveScan: () => Promise<void> | void;
  onContinue: () => void;
}

const BASIS_BADGE: Record<string, { label: string; className: string }> = {
  detected:  { label: 'Detected', className: 'bg-green-500/10 border-green-500/20 text-green-400' },
  derived:   { label: 'Derived',  className: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
  inferred:  { label: 'Inferred', className: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  unknown:   { label: 'Unknown',  className: 'bg-red-500/10 border-red-500/20 text-red-400' },
};

function BasisBadge({ basis }: { basis: string }) {
  const cfg = BASIS_BADGE[basis] ?? BASIS_BADGE.unknown;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function FactRow({ fact }: { fact: InterpretedFact }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer hover:bg-white/3 rounded px-1 py-0.5 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-white/30" /> : <ChevronRight className="w-3 h-3 text-white/30" />}
        <span className="text-white/50 w-28 flex-shrink-0">{fact.label}</span>
        <span className="text-white font-medium flex-1 truncate">{fact.value}</span>
        <BasisBadge basis={fact.basis} />
      </button>
      {expanded && (
        <div className="ml-5 pl-2 border-l border-white/5 mt-1 mb-2 space-y-1">
          <div className="text-white/40">{fact.reasoning}</div>
          {fact.verifyHint && (
            <div className="text-amber-400/70 flex items-start gap-1">
              <Eye className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{fact.verifyHint}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportStep({
  profile,
  report,
  matrix,
  interpretation,
  profileArtifact,
  resourcePlan,
  planningOnly,
  planningProfileContext,
  simulationResult,
  simulationRunning,
  onSaveProfile,
  onExportProfile,
  onImportProfile,
  onRunSimulation,
  onRunLiveScan,
  onContinue,
}: ReportStepProps) {
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [busyAction, setBusyAction] = useState<'import' | 'save' | 'export' | 'scan' | 'simulate' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isBadNVMe = profile.motherboard.toLowerCase().includes('pm981') || profile.motherboard.toLowerCase().includes('pm991') || profile.motherboard.toLowerCase().includes('2200s') || profile.motherboard.toLowerCase().includes('600p');
  const gpuDevices = getProfileGpuDevices(profile);
  const bestDisplayPath = getBestSupportedGpuPath(gpuDevices, parseMacOSVersion(profile.targetOS));
  const hasUnsupportedDgpu = hasUnsupportedDiscreteGpu(gpuDevices);
  const gpuBlocked = report.errors.some(error => /gpu|display path|graphics/i.test(error));

  // Build a one-line verdict sentence
  const verdictSentence = (() => {
    const cpuPart = `${profile.architecture} ${profile.generation}`;
    const gpuPart = bestDisplayPath
      ? `${bestDisplayPath.name} as the display path`
      : 'no supported display path';
    const osTarget = profile.targetOS;
    const fallbackVersion = report.recommendedVersion || report.eligibleVersions[0]?.name;

    if (report.level === 'blocked') {
      if (fallbackVersion) {
        return `${cpuPart} with ${gpuPart} — ${osTarget} is above the viable ceiling for this path. Try ${fallbackVersion} or older instead.`;
      }
      return `${cpuPart} with ${gpuPart} — this hardware remains blocked for Hackintosh planning.`;
    }
    if (report.level === 'supported') {
      return `${cpuPart} with ${gpuPart} targeting ${osTarget} — this is a solid starting point.`;
    }
    if (report.level === 'experimental') {
      return `${cpuPart} with ${gpuPart} targeting ${osTarget} — usable, but expect extra tuning.`;
    }
    return `${cpuPart} with ${gpuPart} targeting ${osTarget} — it can work, but expect manual fixes.`;
  })();

  const planningStatusCopy = planningProfileContext === 'imported_artifact'
    ? 'Imported hardware profile'
    : planningProfileContext === 'saved_artifact'
    ? 'Restored planning profile'
    : 'Live hardware scan';

  const runAction = async (action: 'import' | 'save' | 'export' | 'scan' | 'simulate', runner: () => Promise<void> | void) => {
    if (busyAction) return;
    setBusyAction(action);
    setActionError(null);
    try {
      await runner();
    } catch (error: any) {
      setActionError(error?.message || 'That action could not be completed.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold text-white mb-1.5">Your Hardware</h2>
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="max-w-2xl text-sm font-medium leading-relaxed text-white/50"
          >
            {verdictSentence}
          </motion.p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <button
            onClick={() => void runAction('import', onImportProfile)}
            disabled={busyAction !== null}
            className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {busyAction === 'import' ? 'Importing…' : 'Import Profile'}
          </button>
          <button
            onClick={() => void runAction('save', onSaveProfile)}
            disabled={busyAction !== null}
            className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {busyAction === 'save' ? 'Saving…' : 'Save Profile'}
          </button>
          <button
            onClick={() => void runAction('export', onExportProfile)}
            disabled={busyAction !== null}
            className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {busyAction === 'export' ? 'Exporting…' : 'Export Profile'}
          </button>
          <button
            onClick={() => void runAction('simulate', onRunSimulation)}
            disabled={busyAction !== null || simulationRunning}
            className={`inline-flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors ${simulationRunning || busyAction === 'simulate' ? 'cursor-wait border-blue-500/20 bg-blue-500/10 text-blue-200/70' : 'cursor-pointer border-white/10 bg-white/4 text-white/70 hover:text-white hover:bg-white/8'} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {simulationRunning || busyAction === 'simulate' ? 'Simulating…' : 'Run Safe Simulation'}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="flex-shrink-0 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300/80">
          {actionError}
        </div>
      )}

      <div className={`rounded-2xl border p-3.5 ${planningOnly ? 'border-amber-500/20 bg-amber-500/6' : 'border-blue-500/12 bg-blue-500/5'}`}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`text-[10px] font-bold uppercase tracking-widest ${planningOnly ? 'text-amber-300/80' : 'text-blue-300/75'}`}>
              {planningStatusCopy}
            </div>
            {!planningOnly && (
              <span className="text-[10px] text-white/35">Ready for BIOS, build, and flash</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {profileArtifact && (
              <span className="text-[10px] text-white/30 font-mono">{profileArtifact.digest.slice(0, 12)}</span>
            )}
            {planningOnly && (
              <button
                onClick={() => void runAction('scan', onRunLiveScan)}
                disabled={busyAction !== null}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-500 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === 'scan' ? 'Scanning…' : 'Run Live Scan'}
              </button>
            )}
          </div>
        </div>
        {planningOnly && (
          <div className="mt-2 text-[11px] text-amber-200/50">
            Planning only — BIOS, build, and flash require a live scan.
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.9fr)]">
        <div className="space-y-4">
          <CompatibilitySummary report={report} />

          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">
              Version Matrix
            </div>
            <CompatibilityMatrixView
              rows={matrix.rows}
              selectedVersion={profile.targetOS}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
          {/* CPU */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="p-4 rounded-2xl bg-white/4 border border-white/6 space-y-1.5 relative">
            <div className="text-[10px] text-[#555] font-bold uppercase tracking-widest flex justify-between">
              <span>Processor</span>
              {profile.architecture === 'AMD' && profile.isLaptop ? (
                <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3"/> Unsupported</span>
              ) : (
                <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Supported</span>
              )}
            </div>
            <div className="text-sm font-bold text-white truncate">{profile.cpu}</div>
            <div className="text-xs text-[#666]">{profile.architecture} · {profile.generation} · {profile.coreCount} cores</div>
            {interpretation && (
              <div className="mt-1">
                <BasisBadge basis={interpretation.cpu.generation.basis} />
              </div>
            )}
          </motion.div>

          {/* GPU */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-2xl bg-white/4 border border-white/6 space-y-1.5 relative">
            <div className="text-[10px] text-[#555] font-bold uppercase tracking-widest flex justify-between">
              <span>Graphics</span>
              {gpuBlocked || !bestDisplayPath ? (
                <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3"/> Unsupported</span>
              ) : profile.isLaptop && hasUnsupportedDgpu ? (
                <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Needs iGPU path</span>
              ) : bestDisplayPath.tier === 'partial_support' ? (
                <span className="text-blue-400 flex items-center gap-1"><Info className="w-3 h-3"/> Partial</span>
              ) : (
                <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Supported path</span>
              )}
            </div>
            <div className="text-sm font-bold text-white truncate">{profile.gpu}</div>
            <div className="text-xs text-[#666]">
              {bestDisplayPath?.name
                ? `Active path: ${bestDisplayPath.name}`
                : interpretation?.primaryGpu?.macosSupport?.value ?? 'Manual GPU verification required'}
            </div>
            {interpretation?.primaryGpu?.driverNote && (
              <div className="text-[10px] text-amber-400/60 mt-1">{interpretation.primaryGpu.driverNote}</div>
            )}
          </motion.div>

          {/* Board */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-4 rounded-2xl bg-white/4 border border-white/6 space-y-1.5 relative">
            <div className="text-[10px] text-[#555] font-bold uppercase tracking-widest flex justify-between">
              <span>Board & SMBIOS</span>
              {report.manualVerificationRequired ? (
                <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Verify manually</span>
              ) : interpretation?.board?.model?.basis === 'unknown' ? (
                <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Not detected</span>
              ) : (
                <span className="text-[#888] flex items-center gap-1">Profile selected</span>
              )}
            </div>
            <div className="text-sm font-bold text-white truncate">{profile.motherboard}</div>
            <div className="text-xs text-[#666]">Targeting {profile.smbios}</div>
          </motion.div>

          {/* Memory */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-4 rounded-2xl bg-white/4 border border-white/6 space-y-1.5 relative">
            <div className="text-[10px] text-[#555] font-bold uppercase tracking-widest flex justify-between">
              <span>Memory & Storage</span>
              {isBadNVMe ? (
                <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3"/> Bad NVMe</span>
              ) : parseInt(profile.ram) >= 8 ? (
                <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Optimal</span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Low RAM</span>
              )}
            </div>
            <div className="text-sm font-bold text-white truncate">{profile.ram}</div>
            <div className="text-xs text-[#666]">
              {parseInt(profile.ram) >= 8 ? 'Meets 8+ GB requirement' : 'Performance may be degraded'}
            </div>
          </motion.div>
          </div>

          {interpretation && interpretation.manualVerificationNeeded.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-blue-500/10 bg-blue-500/5 p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-400">
                <Info className="w-3.5 h-3.5" /> Additional checks recommended
              </div>
              {interpretation.manualVerificationNeeded.map((item, i) => (
                <div key={i} className="flex gap-2 text-xs text-blue-300/70">
                  <span className="text-blue-400/40 mt-0.5">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {interpretation && (
            <div className="overflow-hidden rounded-2xl border border-white/6">
              <button
                onClick={() => setShowInterpretation(!showInterpretation)}
                className="flex w-full items-center justify-between bg-white/3 px-4 py-3 transition-colors hover:bg-white/5 cursor-pointer"
              >
                <span className="text-xs font-bold uppercase tracking-widest text-white/50">
                  Detection details
                </span>
                {showInterpretation
                  ? <ChevronDown className="w-4 h-4 text-white/30" />
                  : <ChevronRight className="w-4 h-4 text-white/30" />
                }
              </button>
              {showInterpretation && (
                <div className="space-y-1 border-t border-white/5 px-4 py-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/30">Processor</div>
                  <FactRow fact={interpretation.cpu.vendor} />
                  <FactRow fact={interpretation.cpu.architecture} />
                  <FactRow fact={interpretation.cpu.generation} />
                  <FactRow fact={interpretation.cpu.coreCount} />

                  <div className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-widest text-white/30">Graphics</div>
                  <FactRow fact={interpretation.primaryGpu.vendor} />
                  <FactRow fact={interpretation.primaryGpu.pciIds} />
                  <FactRow fact={interpretation.primaryGpu.macosSupport} />

                  <div className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-widest text-white/30">Board</div>
                  <FactRow fact={interpretation.board.vendor} />
                  <FactRow fact={interpretation.board.model} />
                  <FactRow fact={interpretation.board.formFactor} />

                  <div className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-widest text-white/30">System</div>
                  <FactRow fact={interpretation.ram} />
                  <FactRow fact={interpretation.vmDetected} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ResourcePlanPanel plan={resourcePlan} />
          {simulationResult && (
            <SimulationPreview result={simulationResult} report={report} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-white/5 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-[#555]">
          {planningOnly
            ? <span className="text-amber-400/70">Run a live scan before BIOS, build, or flash.</span>
            : report.errors.length > 0
            ? <span className="text-red-400/70">Blocking issues must be resolved first.</span>
            : report.warnings.length > 0
            ? <span className="text-amber-400/60">Warnings present — review before continuing.</span>
            : <span className="text-emerald-400/60">No issues found.</span>}
        </div>
        {report.errors.length === 0 && !planningOnly ? (
          <button
            onClick={onContinue}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all cursor-pointer shadow-lg shadow-blue-600/20"
          >
            Continue →
          </button>
        ) : planningOnly ? (
          <button
            onClick={() => void runAction('scan', onRunLiveScan)}
            disabled={busyAction !== null}
            className="px-8 py-3 bg-amber-600/20 text-amber-200 rounded-xl text-sm font-bold border border-amber-500/20 hover:bg-amber-600/25 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === 'scan' ? 'Scanning…' : 'Live Scan Required'}
          </button>
        ) : (
          <button
            disabled
            className="px-8 py-3 bg-red-600/20 text-red-300 rounded-xl text-sm font-bold cursor-not-allowed border border-red-500/20 flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" /> Cannot Continue
          </button>
        )}
      </div>
    </div>
  );
}
