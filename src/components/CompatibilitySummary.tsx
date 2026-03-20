import React from 'react';
import { CheckCircle, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import type { CompatibilityReport } from '../../electron/compatibility';

interface Props {
  report: CompatibilityReport | null;
}

const CompatibilitySummary: React.FC<Props> = ({ report }) => {
  if (!report) return null;

  const getLevelStyle = () => {
    switch (report.level) {
      case 'supported':
        return {
          icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
          bg: 'bg-emerald-500/8',
          border: 'border-emerald-500/20',
          text: 'text-emerald-300',
          label: 'Supported Target'
        };
      case 'experimental':
        return {
          icon: <Info className="w-5 h-5 text-sky-400" />,
          bg: 'bg-sky-500/8',
          border: 'border-sky-500/20',
          text: 'text-sky-300',
          label: 'Experimental Path'
        };
      case 'risky':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
          bg: 'bg-amber-500/8',
          border: 'border-amber-500/20',
          text: 'text-amber-300',
          label: 'Risky Path'
        };
      case 'blocked':
        return {
          icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
          bg: 'bg-red-500/8',
          border: 'border-red-500/20',
          text: 'text-red-300',
          label: 'Blocked'
        };
      default:
        return {
          icon: <Info className="w-5 h-5 text-white/50" />,
          bg: 'bg-white/5',
          border: 'border-white/10',
          text: 'text-white/70',
          label: 'Unknown'
        };
    }
  };

  const style = getLevelStyle();

  const confidenceLabel = report.confidence === 'high' ? 'High confidence detection'
    : report.confidence === 'medium' ? 'Medium confidence — some values inferred'
    : 'Low confidence — manual verification recommended';

  return (
    <div className={`p-4 rounded-2xl border ${style.bg} ${style.border} space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {style.icon}
          <div>
            <div className={`text-sm font-bold ${style.text}`}>{style.label}</div>
            <div className="text-[10px] text-white/30 font-medium">
              {confidenceLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-white/70 leading-relaxed">
        {report.explanation}
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/4 border border-white/8">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">
            Advisory Confidence
          </div>
          <div className="text-[11px] text-white/55 mt-1">
            {report.advisoryConfidence.explanation}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-black ${report.advisoryConfidence.score >= 70 ? 'text-emerald-300' : report.advisoryConfidence.score >= 45 ? 'text-amber-300' : 'text-red-300'}`}>
            {report.advisoryConfidence.score}
          </div>
          <div className="text-[10px] text-white/35 font-medium">
            {report.advisoryConfidence.label}
          </div>
        </div>
      </div>

      {report.communityEvidence && (
        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300/80">
              Community-Proven Signal · {report.communityEvidence.signal}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">
              Community Match Level · {report.communityEvidence.matchLevel}
            </div>
          </div>
          <div className="text-[11px] text-white/60 leading-relaxed">
            {report.communityEvidence.summary}
          </div>
          {report.communityEvidence.matchExplanation && (
            <div className="text-[11px] text-white/55 leading-relaxed">
              {report.communityEvidence.matchExplanation}
            </div>
          )}
          {report.communityEvidence.highestReportedVersion && (
            <div className="text-[11px] text-white/55">
              Expected ceiling from similar builds: <span className="text-white/75 font-medium">{report.communityEvidence.highestReportedVersion}</span>
            </div>
          )}
          {report.communityEvidence.whatUsuallyWorks.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/70">
                Usually Works
              </div>
              {report.communityEvidence.whatUsuallyWorks.slice(0, 4).map((item) => (
                <div key={item} className="flex items-start gap-2 text-[11px] text-emerald-200/60">
                  <span className="mt-1 w-1 h-1 rounded-full bg-emerald-400/40 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          )}
          {report.communityEvidence.whatDidNotWork.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/70">
                Usually Breaks
              </div>
              {report.communityEvidence.whatDidNotWork.slice(0, 4).map((item) => (
                <div key={item} className="flex items-start gap-2 text-[11px] text-amber-200/60">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-400/40 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {report.mostLikelyFailurePoints.length > 0 && (
        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-200/75">
            Most Likely Failure Points
          </div>
          {report.mostLikelyFailurePoints.map((point) => (
            <div key={`${point.title}-${point.detail}`} className="rounded-xl border border-white/8 bg-white/4 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold text-white/78">{point.title}</div>
                <div className="text-[9px] uppercase tracking-widest text-white/35">
                  {point.likelihood}
                </div>
              </div>
              <div className="text-[11px] text-white/58 leading-relaxed">
                {point.detail}
              </div>
            </div>
          ))}
        </div>
      )}

      {report.nextActions.length > 0 && (
        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Next Actions
          </div>
          {report.nextActions.map((action) => (
            <div key={`${action.title}-${action.detail}`} className="rounded-xl border border-white/8 bg-white/4 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold text-white/78">{action.title}</div>
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest">
                  <span className={`px-1.5 py-0.5 rounded border ${action.source === 'community' ? 'border-sky-500/20 bg-sky-500/10 text-sky-300' : action.source === 'fallback' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                    {action.source}
                  </span>
                  <span className="text-white/35">{action.confidence}</span>
                </div>
              </div>
              <div className="text-[11px] text-white/58 leading-relaxed">
                {action.detail}
              </div>
            </div>
          ))}
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="pt-2 border-t border-white/5 space-y-1">
          {report.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-amber-300/60">
              <span className="mt-1 w-1 h-1 rounded-full bg-amber-400/40 flex-shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {report.manualVerificationRequired && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
          <AlertTriangle className="w-3 h-3 text-amber-400/70" />
          <span className="text-[10px] text-amber-200/50 font-medium">Manual BIOS configuration still required</span>
        </div>
      )}
    </div>
  );
};

export default CompatibilitySummary;
