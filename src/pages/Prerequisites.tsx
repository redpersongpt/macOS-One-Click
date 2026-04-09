import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useWizard } from '../stores/wizard';
import { useHardware } from '../stores/hardware';
import { useFirmware } from '../stores/firmware';
import { LoadingState } from '../components/feedback/LoadingState';
import { Badge } from '../components/ui/Badge';
import { WarningBanner } from '../components/ui/WarningBanner';
import { Button } from '../components/ui/Button';
import { makeDemoFirmwareReport } from '../lib/demoData';
import type { FirmwareCheck } from '../bridge/types';
import {
  ChevronRight,
  AlertCircle,
  RotateCcw,
  Shield,
  Cpu,
  Server,
  Lock,
  MemoryStick,
  HardDrive,
  Cable,
  Clock3,
  MonitorSmartphone,
} from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24 } },
};

const checkMeta: Record<string, { icon: typeof Shield; label: string }> = {
  uefiMode: { icon: Server, label: 'UEFI Mode' },
  secureBoot: { icon: Lock, label: 'Secure Boot' },
  vtX: { icon: Cpu, label: 'VT-x (Virtualization)' },
  vtD: { icon: Shield, label: 'VT-d (IOMMU)' },
  above4g: { icon: MemoryStick, label: 'Above 4G Decoding' },
};

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  confirmed: 'success',
  inferred: 'info' as 'warning',
  failing: 'danger',
  unknown: 'neutral',
};

const statusLabel: Record<string, string> = {
  confirmed: 'Confirmed',
  inferred: 'Inferred',
  failing: 'Failing',
  unknown: 'Unknown',
};

type ReadinessStatus = 'ready' | 'review' | 'blocked' | 'info';

interface ReadinessItem {
  key: string;
  title: string;
  detail: string;
  status: ReadinessStatus;
  icon: typeof Shield;
}

const readinessBadge: Record<ReadinessStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  ready: 'success',
  review: 'warning',
  blocked: 'danger',
  info: 'info',
};

const readinessLabel: Record<ReadinessStatus, string> = {
  ready: 'Ready',
  review: 'Review',
  blocked: 'Blocked',
  info: 'Guide',
};

function CheckRow({ id, check }: { id: string; check: FirmwareCheck }) {
  const meta = checkMeta[id];
  if (!meta) return null;
  const Icon = meta.icon;
  const variant = statusVariant[check.status] ?? 'neutral';
  const label = statusLabel[check.status] ?? check.status;

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Icon size={16} className="text-[--text-tertiary] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[0.8125rem] text-[--text-primary] leading-snug">{meta.label}</p>
        <p className="text-[0.6875rem] text-[--text-tertiary] mt-0.5 leading-snug truncate">
          {check.evidence}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={variant} size="sm">
          {label}
        </Badge>
        {check.required && (
          <span className="text-[0.625rem] text-[--text-tertiary] uppercase tracking-wide">
            Required
          </span>
        )}
      </div>
    </div>
  );
}

function ReadinessRow({ item }: { item: ReadinessItem }) {
  const Icon = item.icon;

  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <Icon size={16} className="text-[--text-tertiary] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[0.8125rem] text-[--text-primary] leading-snug">{item.title}</p>
          <Badge variant={readinessBadge[item.status]} size="sm">
            {readinessLabel[item.status]}
          </Badge>
        </div>
        <p className="text-[0.6875rem] text-[--text-tertiary] mt-0.5 leading-snug">
          {item.detail}
        </p>
      </div>
    </div>
  );
}

export default function Prerequisites() {
  const { goNext, markCompleted } = useWizard();
  const { isDemo, hardware } = useHardware();
  const { report, loading, error, probe } = useFirmware();

  const displayReport = useMemo(() => {
    if (report) return report;
    if (isDemo) return makeDemoFirmwareReport();
    return null;
  }, [report, isDemo]);

  const hasDmarSensitiveNetworking = useMemo(() => {
    if (!hardware) return false;

    return hardware.network.some((device) => {
      const haystack = `${device.name} ${device.chipset ?? ''}`.toLowerCase();
      if (device.deviceType === 'ethernet') {
        return haystack.includes('i225') || haystack.includes('aquantia') || haystack.includes('aqc');
      }
      if (device.deviceType === 'wifi') {
        return haystack.includes('intel');
      }
      return false;
    });
  }, [hardware]);

  useEffect(() => {
    if (!report && !loading && !isDemo) {
      probe();
    }
  }, [report, loading, isDemo, probe]);

  const handleContinue = () => {
    markCompleted('prerequisites');
    goNext();
  };

  const readinessItems = useMemo<ReadinessItem[]>(() => {
    const networkDevices = hardware?.network ?? [];
    const ethernet = networkDevices.filter((device) => device.deviceType === 'ethernet');
    const wifi = networkDevices.filter((device) => device.deviceType === 'wifi');
    const hostPlatform = isDemo ? 'macOS demo mode' : hardware?.platform || 'unknown host';
    const detectedBiosVersion = displayReport?.biosVersion;
    const hasHardwareInventory =
      Boolean(hardware?.cpu?.name) &&
      (hardware?.gpu.length ?? 0) > 0 &&
      (hardware?.storage.length ?? 0) > 0 &&
      networkDevices.length > 0;

    return [
      {
        key: 'inventory',
        title: 'Know your hardware',
        detail: hasHardwareInventory
          ? `Captured ${hardware?.cpu.name}, ${hardware?.gpu.length ?? 0} GPU entries, ${hardware?.storage.length ?? 0} storage device(s), and ${networkDevices.length} network controller(s).`
          : 'Record the CPU family, GPU, storage model, system model, and network chipsets before you start building media.',
        status: hasHardwareInventory ? 'ready' : 'review',
        icon: MonitorSmartphone,
      },
      {
        key: 'network',
        title: 'Supported network path for online install',
        detail:
          ethernet.length > 0
            ? `Ethernet controller detected: ${ethernet.map((device) => device.chipset || device.name).join(', ')}. This is the preferred path for online recovery and installer downloads.`
            : wifi.length > 0
              ? `No Ethernet controller detected. You only have ${wifi.map((device) => device.chipset || device.name).join(', ')}. Most Wi-Fi cards and USB Wi-Fi dongles are not supported by macOS, so verify this path first.`
              : 'No network controller was detected. Online recovery works best with supported Ethernet or a known-compatible Wi-Fi setup.',
        status: ethernet.length > 0 ? 'ready' : wifi.length > 0 ? 'review' : 'blocked',
        icon: Cable,
      },
      {
        key: 'usb',
        title: 'Installer USB capacity',
        detail:
          'USB size still depends on how you build the installer: 16 GB for a full macOS-created installer, or 4 GB for Windows/Linux recovery-based media.',
        status: 'info',
        icon: HardDrive,
      },
      {
        key: 'host',
        title: 'Working host OS',
        detail: `Current host: ${hostPlatform}. Do setup work from a stable macOS, Windows 10 1703+, or Linux install.`,
        status: hardware?.platform || isDemo ? 'ready' : 'review',
        icon: Server,
      },
      {
        key: 'bios',
        title: 'Latest BIOS installed',
        detail: detectedBiosVersion
          ? `Detected BIOS ${detectedBiosVersion}. Verify that this is the latest stable firmware for your board before continuing.`
          : 'Update to the latest stable BIOS or UEFI release for your board before continuing.',
        status: 'review',
        icon: Shield,
      },
      {
        key: 'patience',
        title: 'Time and recovery margin',
        detail:
          'Leave room for retries, BIOS changes, and recovery work. Do not start on a machine you need immediately.',
        status: 'info',
        icon: Clock3,
      },
    ];
  }, [displayReport?.biosVersion, hardware, isDemo]);

  // Loading
  if (loading) {
    return <LoadingState message="Probing firmware settings..." />;
  }

  // Error
  if (error && !isDemo) {
    return (
      <div className="flex flex-col items-center py-24">
        <AlertCircle size={32} className="text-[--color-red-5] mb-4" />
        <p className="text-sm text-[--text-primary] mb-2">Firmware probe failed</p>
        <p className="text-[0.75rem] text-[--text-tertiary] mb-6 max-w-md text-center">{error}</p>
        <Button variant="secondary" size="sm" onClick={probe} leadingIcon={<RotateCcw size={13} />}>
          Retry
        </Button>
      </div>
    );
  }

  // No data yet
  if (!displayReport) return null;

  const checks: [string, FirmwareCheck][] = [
    ['uefiMode', displayReport.uefiMode],
    ['secureBoot', displayReport.secureBoot],
    ['vtX', displayReport.vtX],
    ['vtD', displayReport.vtD],
    ['above4g', displayReport.above4g],
  ];

  const hasFailingRequired = checks.some(
    ([, check]) => check.required && check.status === 'failing',
  );

  const confidenceLabel =
    displayReport.confidence === 'high'
      ? 'High'
      : displayReport.confidence === 'medium'
        ? 'Medium'
        : 'Low';

  const confidenceVariant: 'success' | 'warning' | 'danger' =
    displayReport.confidence === 'high'
      ? 'success'
      : displayReport.confidence === 'medium'
        ? 'warning'
        : 'danger';

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <motion.h2 variants={itemVariants} className="text-xl font-semibold text-[--text-primary] mb-1">
        Prerequisites
      </motion.h2>
      <motion.p variants={itemVariants} className="text-sm text-[--text-tertiary] mb-6">
        Firmware checks plus install-readiness checks.
      </motion.p>

      {isDemo && (
        <motion.div
          variants={itemVariants}
          className="flex items-center gap-2 rounded-lg border border-[--color-blue-3] bg-[--color-blue-1] px-4 py-3 mb-4"
        >
          <AlertCircle size={14} className="text-[--color-blue-6] shrink-0" />
          <p className="text-[0.75rem] text-[--color-blue-7]">
            Demo mode uses a saved firmware profile. Apply the same steps on your real target machine.
          </p>
        </motion.div>
      )}

      {hasDmarSensitiveNetworking && (
        <motion.div variants={itemVariants}>
          <WarningBanner
            variant="warning"
            message="This hardware may need VT-d left enabled with a cleaned DMAR table. Do not assume VT-d must be disabled if you rely on Intel I225/Aquantia networking or Intel Wi-Fi DriverKit paths."
            className="mb-4"
          />
        </motion.div>
      )}

      {/* BIOS info + confidence */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between rounded-lg bg-[--surface-1] border border-[--border-subtle] px-4 py-3 mb-4"
      >
        <div>
          {displayReport.biosVendor && (
            <p className="text-[0.8125rem] text-[--text-secondary]">
              {displayReport.biosVendor}
              {displayReport.biosVersion ? ` (${displayReport.biosVersion})` : ''}
            </p>
          )}
          {!displayReport.biosVendor && (
            <p className="text-[0.8125rem] text-[--text-tertiary]">BIOS info unavailable</p>
          )}
        </div>
        <Badge variant={confidenceVariant} size="sm" dot>
          {confidenceLabel} confidence
        </Badge>
      </motion.div>

      {/* Warning for failing required checks */}
      {hasFailingRequired && (
        <motion.div variants={itemVariants}>
          <WarningBanner
            variant="danger"
            message="One or more required firmware settings are not properly configured. You must fix these in BIOS before continuing."
            className="mb-4"
          />
        </motion.div>
      )}

      {/* Checks list */}
      <motion.div
        variants={itemVariants}
        className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle] mb-8 overflow-hidden"
      >
        {checks.map(([id, check]) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <CheckRow id={id} check={check} />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle] mb-8 overflow-hidden"
      >
        <div className="px-4 py-2.5 bg-[--surface-2]">
          <p className="text-[0.6875rem] font-medium text-[--text-tertiary] uppercase tracking-wide">
            Install Readiness
          </p>
        </div>
        {readinessItems.map((item) => (
          <ReadinessRow key={item.key} item={item} />
        ))}
      </motion.div>

      {/* Continue */}
      <motion.div variants={itemVariants} className="flex justify-end">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="primary"
            size="md"
            onClick={handleContinue}
            trailingIcon={<ChevronRight size={14} />}
          >
            Continue
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
