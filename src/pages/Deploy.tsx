import { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { useWizard } from '../stores/wizard';
import { useHardware } from '../stores/hardware';
import { useEfi } from '../stores/efi';
import { useCompatibility } from '../stores/compatibility';
import { useDisk } from '../stores/disk';
import { EmptyState } from '../components/feedback/EmptyState';
import { DriveSelection } from '../components/deploy/DriveSelection';
import { FlashReview } from '../components/deploy/FlashReview';
import { FlashProgress } from '../components/deploy/FlashProgress';
import { RecoverySection } from '../components/deploy/RecoverySection';
import { Badge } from '../components/ui/Badge';
import { Separator } from '../components/ui/Separator';
import { makeDemoFlashConfirmation, makeDemoUsbDevices } from '../lib/demoData';
import { HardDrive, AlertCircle } from 'lucide-react';

type DeployView = 'select' | 'review' | 'flashing';

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

export default function Deploy() {
  const { goNext, markCompleted } = useWizard();
  const { isDemo } = useHardware();
  const { buildResult } = useEfi();
  const { report: compatReport } = useCompatibility();
  const {
    flash,
    selectedDevice,
    setDevices,
    setFlashConfirmation,
    error: diskError,
  } = useDisk();

  const [view, setView] = useState<DeployView>('select');

  const targetOs = compatReport?.recommendedOs ?? 'Ventura';

  useEffect(() => {
    if (isDemo) {
      setDevices(makeDemoUsbDevices());
    }
  }, [isDemo, setDevices]);

  const handleRefreshDevices = useCallback(async () => {
    if (isDemo) {
      setDevices(makeDemoUsbDevices());
    }
  }, [isDemo, setDevices]);

  const handlePrepareDemoFlash = useCallback(async () => {
    if (!selectedDevice) return;
    setFlashConfirmation(makeDemoFlashConfirmation(selectedDevice));
  }, [selectedDevice, setFlashConfirmation]);

  const handleDriveSelected = useCallback((_device: string) => {
    // Selection is stored in disk store; move to review
    setView('review');
  }, []);

  const handleFlashConfirm = useCallback(
    async (token: string) => {
      if (!buildResult) return;
      setView('flashing');
      if (isDemo) {
        return;
      }
      await flash(buildResult.efiPath, token);
    },
    [buildResult, flash, isDemo],
  );

  const handleComplete = () => {
    markCompleted('deploy');
    goNext();
  };

  // No build result
  if (!buildResult) {
    return (
      <EmptyState
        icon={<HardDrive size={28} />}
        title="No EFI build found"
        description="Go back to Build to generate your EFI configuration first."
      />
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <motion.h2 variants={itemVariants} className="text-xl font-semibold text-[--text-primary] mb-1">
        Deploy
      </motion.h2>
      <motion.p variants={itemVariants} className="text-sm text-[--text-tertiary] mb-6">
        Select a USB drive and flash your EFI configuration.
      </motion.p>

      {isDemo && (
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between rounded-lg border border-[--color-blue-3] bg-[--color-blue-1] px-4 py-3 mb-4"
        >
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-[--color-blue-6] mt-0.5 shrink-0" />
            <div>
              <p className="text-[0.8125rem] text-[--color-blue-7] font-medium">Deploy demo is active</p>
              <p className="text-[0.6875rem] text-[--color-blue-6] mt-0.5">
                Drive inventory, flash review, and progress states are simulated locally on macOS.
              </p>
            </div>
          </div>
          <Badge variant="info" size="sm" dot>
            Demo
          </Badge>
        </motion.div>
      )}

      {diskError && view !== 'flashing' && (
        <motion.p variants={itemVariants} className="text-[0.75rem] text-[--color-red-6] mb-4">
          {diskError}
        </motion.p>
      )}

      {/* Main view area */}
      <motion.div variants={itemVariants}>
        {view === 'select' && (
          <motion.div
            key="deploy-select"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <DriveSelection onSelect={handleDriveSelected} refreshAction={isDemo ? handleRefreshDevices : undefined} />
          </motion.div>
        )}

        {view === 'review' && selectedDevice && (
          <motion.div
            key="deploy-review"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <FlashReview
              efiPath={buildResult.efiPath}
              onConfirm={handleFlashConfirm}
              onBack={() => {
                setFlashConfirmation(null);
                setView('select');
              }}
              prepareAction={isDemo ? handlePrepareDemoFlash : undefined}
              demoMode={isDemo}
            />
          </motion.div>
        )}

        {view === 'flashing' && (
          <motion.div
            key="deploy-flashing"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <FlashProgress onComplete={handleComplete} demoMode={isDemo} />
          </motion.div>
        )}
      </motion.div>

      {/* Recovery section (always available at bottom) */}
      {view !== 'flashing' && (
        <>
          <Separator className="my-6" />
          <RecoverySection targetOs={targetOs} demoMode={isDemo} />
        </>
      )}
    </motion.div>
  );
}
