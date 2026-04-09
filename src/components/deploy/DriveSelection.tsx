import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useDisk } from '../../stores/disk';
import { LoadingState } from '../feedback/LoadingState';
import { EmptyState } from '../feedback/EmptyState';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { DiskInfo } from '../../bridge/types';
import { HardDrive, RefreshCw, AlertCircle } from 'lucide-react';

type DriveClass = 'safe' | 'suspicious' | 'blocked';

function classifyDrive(disk: DiskInfo): DriveClass {
  if (disk.isSystemDisk) return 'blocked';
  if (!disk.removable || disk.sizeBytes > 128 * 1024 * 1024 * 1024) return 'suspicious';
  return 'safe';
}

const classConfig: Record<
  DriveClass,
  { badge: 'success' | 'warning' | 'danger'; label: string; selectable: boolean }
> = {
  safe: { badge: 'success', label: 'Safe', selectable: true },
  suspicious: { badge: 'warning', label: 'Caution', selectable: true },
  blocked: { badge: 'danger', label: 'System Disk', selectable: false },
};

function DriveCard({
  disk,
  selected,
  onSelect,
}: {
  disk: DiskInfo;
  selected: boolean;
  onSelect: (device: string) => void;
}) {
  const cls = classifyDrive(disk);
  const cfg = classConfig[cls];

  return (
    <button
      type="button"
      disabled={!cfg.selectable}
      onClick={() => onSelect(disk.devicePath)}
      className={[
        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors w-full',
        selected
          ? 'border-[--accent] bg-[--color-blue-1]'
          : 'border-[--border-subtle] bg-[--surface-1] hover:border-[--border]',
        !cfg.selectable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <HardDrive size={16} className="text-[--text-tertiary] mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[0.8125rem] font-medium text-[--text-primary] truncate">
            {disk.model ?? disk.devicePath}
          </p>
          <Badge variant={cfg.badge} size="sm">
            {cfg.label}
          </Badge>
        </div>
        <p className="text-[0.6875rem] text-[--text-tertiary] leading-snug">
          {disk.sizeDisplay}
          {disk.vendor ? ` / ${disk.vendor}` : ''}
          {disk.transport ? ` / ${disk.transport}` : ''}
        </p>
      </div>
    </button>
  );
}

interface DriveSelectionProps {
  onSelect: (device: string) => void;
  refreshAction?: () => Promise<void>;
}

export function DriveSelection({ onSelect, refreshAction }: DriveSelectionProps) {
  const { devices, selectedDevice, loading, error, refresh, select } = useDisk();

  useEffect(() => {
    if (devices.length === 0 && !loading) {
      void (refreshAction ?? refresh)();
    }
  }, [devices.length, loading, refresh, refreshAction]);

  const handleSelect = (device: string) => {
    select(device);
    onSelect(device);
  };

  if (loading && devices.length === 0) {
    return <LoadingState message="Scanning USB devices..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-12">
        <AlertCircle size={28} className="text-[--color-red-5] mb-3" />
        <p className="text-sm text-[--text-primary] mb-2">Failed to list devices</p>
        <p className="text-[0.75rem] text-[--text-tertiary] mb-4 text-center">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void (refreshAction ?? refresh)()}
          leadingIcon={<RefreshCw size={13} />}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={<HardDrive size={28} />}
        title="No USB devices found"
        description="Insert a USB drive and click refresh."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void (refreshAction ?? refresh)()}
            leadingIcon={<RefreshCw size={13} />}
          >
            Refresh
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[0.6875rem] font-medium text-[--text-tertiary] uppercase tracking-wide">
          Select Target Drive
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void (refreshAction ?? refresh)()}
          loading={loading}
          leadingIcon={<RefreshCw size={12} />}
        >
          Refresh
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {devices.map((disk) => (
          <motion.div
            key={disk.devicePath}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            whileHover={{ y: -2 }}
          >
            <DriveCard
              disk={disk}
              selected={selectedDevice === disk.devicePath}
              onSelect={handleSelect}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
