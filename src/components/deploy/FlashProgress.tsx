import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { onFlashMilestone } from '../../bridge/events';
import { useDisk } from '../../stores/disk';
import { Progress } from '../ui/Progress';
import { StatusDot } from '../ui/StatusDot';
import { Button } from '../ui/Button';
import { CheckCircle2 } from 'lucide-react';

type MilestoneStatus = 'pending' | 'active' | 'complete' | 'failed';

interface Milestone {
  id: string;
  label: string;
  status: MilestoneStatus;
  detail?: string;
}

const MILESTONE_ORDER = ['erase', 'format', 'copy', 'verify', 'eject'];
const MILESTONE_LABELS: Record<string, string> = {
  erase: 'Erase Drive',
  format: 'Format Partition',
  copy: 'Copy EFI',
  verify: 'Verify Integrity',
  eject: 'Safe Eject',
};

const statusDotColor: Record<MilestoneStatus, 'gray' | 'blue' | 'green' | 'red'> = {
  pending: 'gray',
  active: 'blue',
  complete: 'green',
  failed: 'red',
};

interface FlashProgressProps {
  onComplete: () => void;
  demoMode?: boolean;
}

export function FlashProgress({ onComplete, demoMode = false }: FlashProgressProps) {
  const diskError = useDisk((s) => s.error);
  const [milestones, setMilestones] = useState<Milestone[]>(
    MILESTONE_ORDER.map((id) => ({
      id,
      label: MILESTONE_LABELS[id] ?? id,
      status: 'pending',
    })),
  );
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (demoMode) {
      const timers: number[] = [];

      MILESTONE_ORDER.forEach((phase, index) => {
        timers.push(
          window.setTimeout(() => {
            setMilestones((prev) =>
              prev.map((milestone, milestoneIndex) => {
                if (milestoneIndex < index) {
                  return { ...milestone, status: 'complete', detail: undefined };
                }
                if (milestone.id === phase) {
                  return {
                    ...milestone,
                    status: index === MILESTONE_ORDER.length - 1 ? 'complete' : 'active',
                    detail:
                      phase === 'erase'
                        ? 'Clearing previous partitions'
                        : phase === 'format'
                          ? 'Creating EFI system partition'
                          : phase === 'copy'
                            ? 'Copying demo EFI bundle'
                            : phase === 'verify'
                              ? 'Running post-flash checks'
                              : undefined,
                  };
                }
                return milestone;
              }),
            );
          }, index * 620),
        );
      });

      timers.push(
        window.setTimeout(() => {
          setMilestones((prev) => prev.map((milestone) => ({ ...milestone, status: 'complete', detail: undefined })));
          setDone(true);
        }, MILESTONE_ORDER.length * 620),
      );

      return () => timers.forEach((id) => window.clearTimeout(id));
    }

    let unlisten: (() => void) | undefined;

    const subscribe = async () => {
      unlisten = await onFlashMilestone(({ phase, detail }) => {
        setMilestones((prev) => {
          const next = prev.map((m) => ({ ...m }));
          const idx = next.findIndex((m) => m.id === phase);
          if (idx === -1) return prev;

          // Mark all before as complete
          for (let i = 0; i < idx; i++) {
            if (next[i].status !== 'failed') {
              next[i].status = 'complete';
            }
          }

          if (detail === 'failed') {
            next[idx].status = 'failed';
            next[idx].detail = 'Failed';
          } else if (detail === 'complete' || detail === 'done') {
            next[idx].status = 'complete';
            next[idx].detail = undefined;
          } else {
            next[idx].status = 'active';
            next[idx].detail = detail;
          }

          return next;
        });
      });
    };
    subscribe();
    return () => unlisten?.();
  }, [demoMode]);

  // Detect completion or failure
  useEffect(() => {
    const allComplete = milestones.every((m) => m.status === 'complete');
    const anyFailed = milestones.some((m) => m.status === 'failed');

    if (allComplete && !done) {
      setDone(true);
    }
    if (anyFailed) {
      setFailed(true);
    }
  }, [milestones, done]);

  useEffect(() => {
    if (diskError) {
      setFailed(true);
    }
  }, [diskError]);

  const completedCount = milestones.filter((m) => m.status === 'complete').length;
  const progressValue = (completedCount / milestones.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      <Progress
        value={progressValue}
        variant={failed ? 'danger' : done ? 'success' : 'accent'}
        height={3}
        label="Flash progress"
        className="mb-6"
      />

      <div className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle] mb-6 overflow-hidden">
        {milestones.map((m) => (
          <motion.div
            key={m.id}
            className="flex items-center gap-3 px-4 py-2.5"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <StatusDot
              color={statusDotColor[m.status]}
              pulse={m.status === 'active'}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p
                className={`text-[0.8125rem] leading-snug ${
                  m.status === 'active'
                    ? 'text-[--text-primary] font-medium'
                    : m.status === 'complete'
                      ? 'text-[--text-secondary]'
                      : m.status === 'failed'
                        ? 'text-[--color-red-6]'
                        : 'text-[--text-tertiary]'
                }`}
              >
                {m.label}
              </p>
              {m.detail && (
                <p className="text-[0.6875rem] text-[--text-tertiary] mt-0.5 truncate">
                  {m.detail}
                </p>
              )}
            </div>
            {m.status === 'complete' && (
              <CheckCircle2 size={14} className="text-[--color-green-5] shrink-0" />
            )}
          </motion.div>
        ))}
      </div>

      {done && (
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <CheckCircle2 size={32} className="text-[--color-green-5]" />
          <p className="text-[0.875rem] font-semibold text-[--text-primary]">
            Flash complete
          </p>
          <p className="text-[0.8125rem] text-[--text-tertiary] text-center max-w-xs">
            Your USB drive is ready. You can now boot from it to start the macOS installation.
          </p>
          <Button variant="primary" size="md" onClick={onComplete}>
            Finish
          </Button>
        </motion.div>
      )}

      {failed && !done && (
        <div className="text-center">
          <p className="text-[0.875rem] font-semibold text-[--color-red-6] mb-2">
            Flash failed
          </p>
          <p className="text-[0.8125rem] text-[--text-tertiary]">
            {diskError ?? 'Check the error above and try again with a different drive.'}
          </p>
        </div>
      )}
    </motion.div>
  );
}
