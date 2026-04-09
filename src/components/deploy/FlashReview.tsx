import { useState } from 'react';
import { motion } from 'motion/react';
import { useDisk } from '../../stores/disk';
import { DangerConfirmation } from '../feedback/DangerConfirmation';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ArrowRight, AlertTriangle } from 'lucide-react';

interface FlashReviewProps {
  efiPath: string;
  onConfirm: (token: string) => void;
  onBack: () => void;
  prepareAction?: () => Promise<void>;
  demoMode?: boolean;
}

export function FlashReview({
  efiPath,
  onConfirm,
  onBack,
  prepareAction,
  demoMode = false,
}: FlashReviewProps) {
  const { selectedDevice, flashConfirmation, loading, flashing, error, prepareFlash } = useDisk();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handlePrepare = async () => {
    await (prepareAction ?? (() => prepareFlash(efiPath)))();
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    if (flashConfirmation) {
      setDialogOpen(false);
      onConfirm(flashConfirmation.token);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      {/* Source / Target */}
      <div className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle] mb-4 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-[0.75rem] text-[--text-tertiary] w-16 shrink-0">Source</span>
          <span className="text-[0.8125rem] text-[--text-primary] flex-1 truncate font-mono">
            {efiPath}
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-[0.75rem] text-[--text-tertiary] w-16 shrink-0">Target</span>
          <span className="text-[0.8125rem] text-[--text-primary] flex-1 truncate font-mono">
            {selectedDevice ?? 'None'}
          </span>
          {flashConfirmation && (
            <Badge variant="info" size="sm">{flashConfirmation.diskDisplay}</Badge>
          )}
        </div>
      </div>

      {demoMode && (
        <div className="rounded-lg border border-[--color-blue-3] bg-[--color-blue-1] px-4 py-3 mb-4">
          <p className="text-[0.75rem] uppercase tracking-wide text-[--color-blue-6] mb-1">Demo flash review</p>
          <p className="text-[0.8125rem] text-[--color-blue-7]">
            This confirms the deploy flow and safety prompts without touching a real drive.
          </p>
        </div>
      )}

      {/* Consequences warning */}
      <div className="flex items-start gap-3 rounded-md bg-[--color-amber-1] border border-[--color-amber-3] px-4 py-3 mb-6">
        <AlertTriangle size={14} className="text-[--color-amber-6] mt-0.5 shrink-0" />
        <p className="text-[0.8125rem] text-[--color-amber-7] leading-snug">
          This will permanently erase all data on the selected drive and write the EFI configuration.
          Make sure you have backed up any important data.
        </p>
      </div>

      {error && (
        <p className="text-[0.75rem] text-[--color-red-6] mb-4">{error}</p>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="ghost" size="md" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="danger"
          size="md"
          onClick={handlePrepare}
          loading={loading}
          trailingIcon={<ArrowRight size={14} />}
        >
          Prepare Flash
        </Button>
      </div>

      {/* Danger confirmation dialog */}
      <DangerConfirmation
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
        title="Flash USB Drive"
        consequences={[
          'Erase ALL data on the selected drive',
          'Format the drive with a GPT partition table',
          'Write the OpenCore EFI to the EFI system partition',
          'This action cannot be undone',
        ]}
        confirmPhrase={demoMode ? undefined : 'FLASH'}
        confirmLabel="Flash Drive"
        cancelLabel="Cancel"
        loading={flashing}
      />
    </motion.div>
  );
}
