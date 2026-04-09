import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useWizard } from '../stores/wizard';
import { useHardware } from '../stores/hardware';
import { useFirmware } from '../stores/firmware';
import { useEfi } from '../stores/efi';
import { EmptyState } from '../components/feedback/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { makeDemoFirmwareReport } from '../lib/demoData';
import type { FirmwareCheck } from '../bridge/types';
import {
  ChevronRight,
  Settings,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
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

interface BiosSetting {
  key: string;
  name: string;
  currentStatus: string;
  requiredValue: string;
  howToChange: string;
  group: 'required' | 'recommended' | 'correct';
}

function deriveBiosSettings(
  checks: [string, FirmwareCheck][],
): BiosSetting[] {
  const settings: BiosSetting[] = [];

  const settingsMap: Record<
    string,
    { name: string; requiredValue: string; howToChange: string }
  > = {
    uefiMode: {
      name: 'Boot Mode',
      requiredValue: 'UEFI (not Legacy/CSM)',
      howToChange: 'Boot > Boot Mode > UEFI Only. Disable CSM/Legacy Support.',
    },
    secureBoot: {
      name: 'Secure Boot',
      requiredValue: 'Disabled',
      howToChange: 'Security > Secure Boot > Disabled. Some boards: Boot > Secure Boot State.',
    },
    vtX: {
      name: 'Intel VT-x / AMD-V',
      requiredValue: 'Enabled',
      howToChange: 'Advanced > CPU Configuration > Intel Virtualization Technology > Enabled.',
    },
    vtD: {
      name: 'VT-d / IOMMU',
      requiredValue: 'Usually Disabled. Keep Enabled only for a cleaned DMAR + VT-d networking path.',
      howToChange:
        'Default path: Advanced > System Agent > VT-d > Disabled. If you depend on Intel I225/Aquantia or an Intel Wi-Fi VT-d path, keep VT-d enabled, clean the DMAR table, set DisableIoMapper to NO, and remove legacy e1000 boot-args.',
    },
    above4g: {
      name: 'Above 4G Decoding',
      requiredValue: 'Enabled',
      howToChange: 'Advanced > PCI Subsystem Settings > Above 4G Decoding > Enabled.',
    },
  };

  for (const [key, check] of checks) {
    const meta = settingsMap[key];
    if (!meta) continue;

    const isCorrect = check.status === 'confirmed';
    const isFailing = check.status === 'failing';

    let group: BiosSetting['group'];
    if (isCorrect) {
      group = 'correct';
    } else if (check.required && isFailing) {
      group = 'required';
    } else {
      group = 'recommended';
    }

    settings.push({
      key,
      name: meta.name,
      currentStatus: check.status,
      requiredValue: meta.requiredValue,
      howToChange: meta.howToChange,
      group,
    });
  }

  return settings;
}

function SettingRow({ setting }: { setting: BiosSetting }) {
  const statusVariant =
    setting.group === 'correct'
      ? 'success'
      : setting.group === 'required'
        ? 'danger'
        : ('warning' as const);

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0">
        {setting.group === 'correct' ? (
          <CheckCircle2 size={15} className="text-[--color-green-5]" />
        ) : setting.group === 'required' ? (
          <AlertTriangle size={15} className="text-[--color-red-5]" />
        ) : (
          <ArrowRightLeft size={15} className="text-[--color-amber-5]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[0.8125rem] font-medium text-[--text-primary] leading-snug">
            {setting.name}
          </p>
          <Badge variant={statusVariant} size="sm">
            {setting.currentStatus}
          </Badge>
        </div>
        <p className="text-[0.6875rem] text-[--text-tertiary] leading-snug">
          Required: {setting.requiredValue}
        </p>
        {setting.group !== 'correct' && (
          <p className="text-[0.6875rem] text-[--color-blue-6] mt-1 leading-snug">
            {setting.howToChange}
          </p>
        )}
      </div>
    </div>
  );
}

function SettingGroup({
  title,
  settings,
}: {
  title: string;
  settings: BiosSetting[];
}) {
  if (settings.length === 0) return null;

  return (
    <div className="rounded-lg border border-[--border-subtle] bg-[--surface-1] divide-y divide-[--border-subtle]">
      <div className="px-4 py-2.5">
        <p className="text-[0.6875rem] font-medium text-[--text-tertiary] uppercase tracking-wide">
          {title} ({settings.length})
        </p>
      </div>
      {settings.map((s) => (
        <SettingRow key={s.key} setting={s} />
      ))}
    </div>
  );
}

export default function BiosSetup() {
  const { goNext, markCompleted } = useWizard();
  const { isDemo, hardware } = useHardware();
  const { report } = useFirmware();
  const clearEfi = useEfi((s) => s.clear);

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

  const handleContinue = () => {
    clearEfi();
    markCompleted('bios');
    goNext();
  };

  // No firmware report available
  if (!displayReport) {
    return (
      <EmptyState
        icon={<Settings size={28} />}
        title="No firmware data"
        description="Firmware probe did not run. Go back to Prerequisites to run the check."
      />
    );
  }

  const checks: [string, FirmwareCheck][] = [
    ['uefiMode', displayReport.uefiMode],
    ['secureBoot', displayReport.secureBoot],
    ['vtX', displayReport.vtX],
    ['vtD', displayReport.vtD],
    ['above4g', displayReport.above4g],
  ];

  const settings = deriveBiosSettings(checks);
  const required = settings.filter((s) => s.group === 'required');
  const recommended = settings.filter((s) => s.group === 'recommended');
  const correct = settings.filter((s) => s.group === 'correct');

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <motion.h2 variants={itemVariants} className="text-xl font-semibold text-[--text-primary] mb-1">
        BIOS Setup
      </motion.h2>
      <motion.p variants={itemVariants} className="text-sm text-[--text-tertiary] mb-6">
        Review and apply the recommended BIOS settings before building your EFI.
      </motion.p>

      {isDemo && (
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between rounded-lg border border-[--color-blue-3] bg-[--color-blue-1] px-4 py-3 mb-4"
        >
          <div>
            <p className="text-[0.8125rem] text-[--color-blue-7] font-medium">Demo firmware worksheet</p>
            <p className="text-[0.6875rem] text-[--color-blue-6] mt-0.5">
              Based on an ASUS Z490 desktop profile.
            </p>
          </div>
          <Badge variant="info" size="sm" dot>
            Simulated
          </Badge>
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Required', value: required.length, tone: 'text-[--color-red-6]' },
          { label: 'Recommended', value: recommended.length, tone: 'text-[--color-amber-6]' },
          { label: 'Correct', value: correct.length, tone: 'text-[--color-green-6]' },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            className="rounded-lg border border-[--border-subtle] bg-[--surface-1] px-4 py-3"
            whileHover={{ y: -2 }}
          >
            <p className="text-[0.6875rem] uppercase tracking-wide text-[--text-tertiary]">{stat.label}</p>
            <p className={`text-lg font-semibold mt-1 ${stat.tone}`}>{stat.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {hasDmarSensitiveNetworking && (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-[--color-amber-3] bg-[--color-amber-1] px-4 py-3 mb-5"
        >
          <p className="text-[0.8125rem] font-medium text-[--color-amber-7]">VT-d / DMAR note</p>
          <p className="text-[0.6875rem] text-[--color-amber-7] mt-1 leading-snug">
            Some Intel I225, Aquantia, and Intel Wi-Fi setups work better with VT-d left enabled.
            If you keep VT-d on, you need a cleaned DMAR table and must remove legacy
            <span className="font-mono"> dk.e1000=0</span> or <span className="font-mono"> e1000=0</span> boot-args.
          </p>
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="flex flex-col gap-4 mb-8">
        <SettingGroup title="Required Changes" settings={required} />
        <SettingGroup title="Recommended Changes" settings={recommended} />
        <SettingGroup title="Already Correct" settings={correct} />
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
            I've made these changes
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
