import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useWizard } from '../stores/wizard';
import { useHardware } from '../stores/hardware';
import { useEfi } from '../stores/efi';
import { LoadingState } from '../components/feedback/LoadingState';
import { EmptyState } from '../components/feedback/EmptyState';
import { Badge } from '../components/ui/Badge';
import { WarningBanner } from '../components/ui/WarningBanner';
import { Button } from '../components/ui/Button';
import { makeDemoValidationResult } from '../lib/demoData';
import type { ValidationIssue, KextResult } from '../bridge/types';
import {
  ChevronRight,
  AlertCircle,
  RotateCcw,
  FileCode,
  CheckCircle2,
  XCircle,
  Package,
  Cpu,
  Terminal,
  Volume2,
  Fingerprint,
} from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24 } },
};

function SectionHeader({ icon: Icon, title }: { icon: typeof Cpu; title: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-[--surface-2]">
      <Icon size={13} className="text-[--text-tertiary]" />
      <p className="text-[0.6875rem] font-medium text-[--text-tertiary] uppercase tracking-wide">
        {title}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2">
      <span className="text-[0.75rem] text-[--text-tertiary] w-28 shrink-0">{label}</span>
      <span className="text-[0.8125rem] text-[--text-primary] flex-1 truncate">{value}</span>
    </div>
  );
}

function KextRow({ kext }: { kext: KextResult }) {
  const variant =
    kext.status === 'downloaded' || kext.status === 'cached'
      ? 'success'
      : kext.status === 'failed'
        ? 'danger'
        : ('warning' as const);

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="text-[0.8125rem] text-[--text-primary] flex-1 truncate">{kext.name}</span>
      {kext.version && (
        <span className="text-[0.6875rem] text-[--text-tertiary] shrink-0">{kext.version}</span>
      )}
      <Badge variant={variant} size="sm">
        {kext.status}
      </Badge>
    </div>
  );
}

function ValidationRow({ issue }: { issue: ValidationIssue }) {
  const variant = issue.severity === 'error' ? 'danger' : issue.severity === 'warning' ? 'warning' : 'info';
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <Badge variant={variant} size="sm" className="mt-0.5 shrink-0">
        {issue.severity}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-[0.8125rem] text-[--text-primary] leading-snug">{issue.section}</p>
        <p className="text-[0.6875rem] text-[--text-tertiary] mt-0.5 leading-snug">{issue.message}</p>
        {issue.path && (
          <p className="text-[0.625rem] font-mono text-[--text-tertiary] mt-0.5">{issue.path}</p>
        )}
      </div>
    </div>
  );
}

export default function Review() {
  const { goNext, goTo, markCompleted } = useWizard();
  const { isDemo } = useHardware();
  const { buildResult, validationResult, validating, error, validate, clear, setValidationResult } = useEfi();

  // Auto-validate on mount
  useEffect(() => {
    if (buildResult && !validationResult && !validating) {
      if (isDemo) {
        setValidationResult(makeDemoValidationResult());
      } else {
        void validate(buildResult.efiPath);
      }
    }
  }, [buildResult, validationResult, validating, isDemo, setValidationResult, validate]);

  const handleContinue = () => {
    markCompleted('review');
    goNext();
  };

  const handleRebuild = () => {
    clear();
    goTo('build');
  };

  // No build result
  if (!buildResult) {
    return (
      <EmptyState
        icon={<FileCode size={28} />}
        title="No EFI build found"
        description="Go back to Build to generate your EFI configuration first."
      />
    );
  }

  // Validating
  if (validating) {
    return <LoadingState message="Validating EFI configuration..." />;
  }

  // Error
  if (error && !isDemo) {
    return (
      <motion.div
        className="flex flex-col items-center py-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <AlertCircle size={32} className="text-[--color-red-5] mb-4" />
        <p className="text-sm text-[--text-primary] mb-2">Validation failed</p>
        <p className="text-[0.75rem] text-[--text-tertiary] mb-6 max-w-md text-center">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => validate(buildResult.efiPath)}
          leadingIcon={<RotateCcw size={13} />}
        >
          Retry
        </Button>
      </motion.div>
    );
  }

  const displayValidation = validationResult ?? (isDemo ? makeDemoValidationResult() : null);
  const hasErrors = displayValidation?.issues.some((i) => i.severity === 'error') ?? false;
  const hasWarnings = displayValidation?.issues.some((i) => i.severity === 'warning') ?? false;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <motion.h2 variants={itemVariants} className="text-xl font-semibold text-[--text-primary] mb-1">
        Review
      </motion.h2>
      <motion.p variants={itemVariants} className="text-sm text-[--text-tertiary] mb-6">
        Review your EFI configuration before deployment.
      </motion.p>

      {isDemo && (
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between rounded-lg border border-[--color-blue-3] bg-[--color-blue-1] px-4 py-3 mb-4"
        >
          <div>
            <p className="text-[0.8125rem] text-[--color-blue-7] font-medium">Offline validation snapshot</p>
            <p className="text-[0.6875rem] text-[--color-blue-6] mt-0.5">
              Review uses a local fixture so the macOS demo flow stays complete end to end.
            </p>
          </div>
          <Badge variant="info" size="sm" dot>
            Demo
          </Badge>
        </motion.div>
      )}

      {/* Validation status */}
      {displayValidation && (
        <motion.div
          variants={itemVariants}
          className="flex items-center gap-3 rounded-lg bg-[--surface-1] border border-[--border-subtle] px-4 py-3 mb-4"
        >
          {displayValidation.valid ? (
            <CheckCircle2 size={18} className="text-[--color-green-5] shrink-0" />
          ) : (
            <XCircle size={18} className="text-[--color-red-5] shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-[0.8125rem] font-medium text-[--text-primary]">
              {displayValidation.valid ? 'Validation Passed' : 'Validation Failed'}
            </p>
            <p className="text-[0.6875rem] text-[--text-tertiary]">
              {displayValidation.sectionsPresent.length} sections present
              {displayValidation.sectionsMissing.length > 0 &&
                `, ${displayValidation.sectionsMissing.length} missing`}
            </p>
          </div>
          <Badge
            variant={displayValidation.valid ? 'success' : 'danger'}
            size="sm"
            dot
          >
            {displayValidation.valid ? 'Pass' : 'Fail'}
          </Badge>
        </motion.div>
      )}

      {/* Warnings for errors */}
      {hasErrors && (
        <motion.div variants={itemVariants}>
          <WarningBanner
            variant="danger"
            message="Validation found errors. The EFI may not boot. Consider rebuilding."
            className="mb-3"
          />
        </motion.div>
      )}
      {!hasErrors && hasWarnings && (
        <motion.div variants={itemVariants}>
          <WarningBanner
            variant="warning"
            message="Validation found warnings. The EFI should boot but may have issues."
            className="mb-3"
          />
        </motion.div>
      )}

      {/* EFI Report Card */}
      <motion.div
        variants={itemVariants}
        className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle] mb-4 overflow-hidden"
      >
        {/* SMBIOS */}
        <SectionHeader icon={Fingerprint} title="SMBIOS & OpenCore" />
        <InfoRow label="OpenCore" value={buildResult.opencoreVersion} />
        <InfoRow label="EFI Path" value={buildResult.efiPath} />

        {/* SSDTs */}
        {buildResult.ssdts.length > 0 && (
          <>
            <SectionHeader icon={Cpu} title="SSDTs" />
            {buildResult.ssdts.map((ssdt, i) => (
              <InfoRow key={i} label={`SSDT ${i + 1}`} value={ssdt} />
            ))}
          </>
        )}

        {/* Boot Args */}
        {buildResult.warnings.length > 0 && (
          <>
            <SectionHeader icon={Terminal} title="Notes" />
            {buildResult.warnings.map((w, i) => (
              <div key={i} className="px-4 py-2">
                <p className="text-[0.75rem] text-[--color-amber-6] leading-snug">{w}</p>
              </div>
            ))}
          </>
        )}
      </motion.div>

      {/* Kexts */}
      {buildResult.kexts.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle] mb-4 overflow-hidden"
        >
          <SectionHeader icon={Package} title={`Kexts (${buildResult.kexts.length})`} />
          {buildResult.kexts.map((k, i) => (
            <KextRow key={i} kext={k} />
          ))}
        </motion.div>
      )}

      {/* Validation Issues */}
      {displayValidation && displayValidation.issues.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle] mb-4 overflow-hidden"
        >
          <div className="px-4 py-2.5 bg-[--surface-2]">
            <p className="text-[0.6875rem] font-medium text-[--text-tertiary] uppercase tracking-wide">
              Validation Issues ({displayValidation.issues.length})
            </p>
          </div>
          {displayValidation.issues.map((issue, i) => (
            <ValidationRow key={i} issue={issue} />
          ))}
        </motion.div>
      )}

      {/* Actions */}
      <motion.div variants={itemVariants} className="flex justify-between mt-8">
        <Button
          variant="ghost"
          size="md"
          onClick={handleRebuild}
          leadingIcon={<RotateCcw size={14} />}
        >
          Rebuild
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleContinue}
          disabled={hasErrors}
          trailingIcon={<ChevronRight size={14} />}
        >
          Continue to Deploy
        </Button>
      </motion.div>
    </motion.div>
  );
}
