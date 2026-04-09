import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../../bridge/invoke';
import { onRecoveryProgress } from '../../bridge/events';
import { Progress } from '../ui/Progress';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { parseError } from '../../lib/parseError';
import type { RecoveryCacheInfo } from '../../bridge/types';
import { ChevronDown, ChevronUp, Download, Trash2, CheckCircle2 } from 'lucide-react';

interface RecoverySectionProps {
  targetOs: string;
  demoMode?: boolean;
}

export function RecoverySection({ targetOs, demoMode = false }: RecoverySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<RecoveryCacheInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Load cache info
  useEffect(() => {
    if (expanded && !cacheInfo) {
      if (demoMode) {
        setCacheInfo({ available: false, osVersion: targetOs });
      } else {
        api.getCachedRecoveryInfo().then(setCacheInfo).catch(() => {});
      }
    }
  }, [expanded, cacheInfo, demoMode, targetOs]);

  // Subscribe to download progress
  useEffect(() => {
    if (!downloading || demoMode) return;
    let unlisten: (() => void) | undefined;

    const subscribe = async () => {
      unlisten = await onRecoveryProgress(({ percent, status }) => {
        setProgress(percent);
        setProgressStatus(status);
        if (percent >= 100) {
          setDownloading(false);
          api.getCachedRecoveryInfo().then(setCacheInfo).catch(() => {});
        }
      });
    };
    subscribe();
    return () => unlisten?.();
  }, [downloading, demoMode]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    setProgress(0);
    if (demoMode) {
      const steps = [
        { percent: 18, status: 'Querying Apple recovery catalog...' },
        { percent: 42, status: 'Downloading BaseSystem payload...' },
        { percent: 74, status: 'Verifying demo checksum...' },
        { percent: 100, status: 'Recovery image cached for demo use.' },
      ];

      for (const [index, step] of steps.entries()) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, index === 0 ? 240 : 520));
        setProgress(step.percent);
        setProgressStatus(step.status);
      }

      setCacheInfo({
        available: true,
        osVersion: targetOs,
        dmgPath: `/demo/recovery/${targetOs.toLowerCase()}.dmg`,
        sizeBytes: 14500000000,
      });
      setDownloading(false);
      return;
    }

    try {
      await api.downloadRecovery(targetOs);
    } catch (err) {
      setError(parseError(err));
      setDownloading(false);
    }
  };

  const handleClear = async () => {
    if (demoMode) {
      setCacheInfo({ available: false, osVersion: targetOs });
      setProgress(0);
      setProgressStatus('');
      return;
    }
    try {
      await api.clearRecoveryCache();
      setCacheInfo(null);
    } catch {
      // ignore
    }
  };

  const ToggleIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <motion.div
      className="rounded-lg border border-[--border-subtle] bg-[--surface-1]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Download size={14} className="text-[--text-tertiary]" />
          <span className="text-[0.8125rem] font-medium text-[--text-secondary]">
            macOS Recovery
          </span>
          {cacheInfo?.available && (
            <Badge variant="success" size="sm">Cached</Badge>
          )}
        </div>
        <ToggleIcon size={14} className="text-[--text-tertiary]" />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-[--border-subtle] pt-3">
          {/* Cache info */}
          {cacheInfo?.available && (
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 size={14} className="text-[--color-green-5] shrink-0" />
              <div className="flex-1">
                <p className="text-[0.8125rem] text-[--text-primary]">
                  macOS {cacheInfo.osVersion ?? targetOs} recovery image cached
                </p>
                {cacheInfo.sizeBytes != null && (
                  <p className="text-[0.6875rem] text-[--text-tertiary]">
                    {(cacheInfo.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleClear} leadingIcon={<Trash2 size={12} />}>
                Clear
              </Button>
            </div>
          )}

          {demoMode && !cacheInfo?.available && (
            <div className="rounded-md border border-[--color-blue-3] bg-[--color-blue-1] px-3 py-2.5 mb-3">
              <p className="text-[0.75rem] text-[--color-blue-7]">
                Demo mode stores the recovery image locally and does not contact Apple.
              </p>
            </div>
          )}

          <div className="rounded-md border border-[--border-subtle] bg-[--surface-2] px-3 py-2.5 mb-3">
            <p className="text-[0.75rem] text-[--text-secondary] leading-snug">
              Recovery download follows the online installer path. On Windows and Linux, this is the expected route and it still depends on a macOS-supported network device. Full offline installer creation remains a macOS-only workflow.
            </p>
          </div>

          {/* Download state */}
          {downloading && (
            <div className="mb-3">
              <Progress value={progress} variant="accent" height={3} label="Download progress" className="mb-1.5" />
              <p className="text-[0.6875rem] text-[--text-tertiary]">
                {progressStatus || `Downloading... ${Math.round(progress)}%`}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[0.75rem] text-[--color-red-6] mb-3">{error}</p>
          )}

          {/* Download button */}
          {!cacheInfo?.available && !downloading && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              leadingIcon={<Download size={13} />}
            >
              Download macOS {targetOs} Recovery
            </Button>
          )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
