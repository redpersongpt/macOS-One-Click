import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useWizard } from '../stores/wizard';
import { useHardware } from '../stores/hardware';
import { useCompatibility } from '../stores/compatibility';
import { buildProfile } from '../lib/buildProfile';
import type { CompatibilityReport } from '../bridge/types';
import { Loader2, AlertCircle } from 'lucide-react';

// Demo compatibility for when backend isn't available
function makeDemoReport(): CompatibilityReport {
  return {
    overall: 'supported',
    cpuSupported: true,
    gpuSupported: true,
    audioSupported: true,
    networkSupported: true,
    recommendedOs: 'Ventura',
    supportedOsVersions: ['Monterey', 'Ventura', 'Sonoma'],
    issues: [
      { component: 'Wi-Fi', severity: 'warning', message: 'Intel AX200 requires itlwm.kext (not native)', workaround: 'itlwm or AirportItlwm will be included automatically' },
    ],
    confidence: 0.92,
  };
}

export default function Compatibility() {
  const { goNext, markCompleted } = useWizard();
  const { hardware, isDemo } = useHardware();
  const { report, loading, error, check } = useCompatibility();

  // In demo mode, skip backend call
  const displayReport = useMemo(() => {
    if (report) return report;
    if (isDemo) return makeDemoReport();
    return null;
  }, [report, isDemo]);

  useEffect(() => {
    if (hardware && !report && !loading && !isDemo) {
      check(buildProfile(hardware));
    }
  }, [hardware, isDemo]);

  const handleContinue = () => {
    markCompleted('compatibility');
    goNext();
  };

  const advisoryNotes = useMemo(() => {
    if (!hardware) return [];

    const notes: { title: string; detail: string; tone: 'warning' | 'info' }[] = [];
    const wifiDevices = hardware.network.filter((device) => device.deviceType === 'wifi');
    const storageDevices = hardware.storage;
    const hasLaptopDgpu = hardware.isLaptop && hardware.gpu.some((gpu) => gpu.isDiscrete);

    if (hasLaptopDgpu) {
      notes.push({
        title: 'Laptop dGPU routing',
        detail:
          'Many laptop discrete GPUs cannot drive the internal display in macOS. Plan around the iGPU path unless this model is known to route external outputs cleanly.',
        tone: 'warning',
      });
    }

    if (wifiDevices.some((device) => {
      const name = `${device.name} ${device.chipset ?? ''}`.toLowerCase();
      return name.includes('intel') || name.includes('qualcomm');
    })) {
      notes.push({
        title: 'Wireless support',
        detail:
          'Intel and Qualcomm wireless cards are usually not native. Expect a kext-based path or a card swap instead of plug-and-play Wi-Fi.',
        tone: 'warning',
      });
    }

    if (storageDevices.some((device) => {
      const name = device.name.toLowerCase();
      return name.includes('pm981') || name.includes('pm991') || name.includes('2200s');
    })) {
      notes.push({
        title: 'NVMe caution',
        detail:
          'This storage family is known for macOS boot or panic issues. NVMeFix can help, but these drives still deserve extra caution.',
        tone: 'warning',
      });
    }

    if (storageDevices.some((device) => device.name.toLowerCase().includes('600p'))) {
      notes.push({
        title: 'Intel 600p warning',
        detail:
          'Intel 600p drives can boot, but they have a reputation for instability and odd install behavior.',
        tone: 'warning',
      });
    }

    if (storageDevices.some((device) => device.name.toLowerCase().includes('optane'))) {
      notes.push({
        title: 'Optane warning',
        detail:
          'Optane-backed storage setups are a bad fit for macOS. Disable the Optane path or remove that dependency before install.',
        tone: 'warning',
      });
    }

    if (hardware.isLaptop) {
      notes.push({
        title: 'Laptop extras',
        detail:
          'Fingerprint readers, Windows Hello face hardware, Intel SST audio paths, and Thunderbolt hotplug support often remain limited even after a successful install.',
        tone: 'info',
      });
    }

    return notes;
  }, [hardware]);

  // Loading
  if (loading) {
    return (
      <motion.div
        className="flex flex-col items-center py-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Loader2 size={24} className="animate-spin text-[#6e6e76] mb-4" />
        <p className="text-[13px] text-[#6e6e76]">Checking compatibility...</p>
      </motion.div>
    );
  }

  // Error (not demo)
  if (error && !isDemo) {
    return (
      <motion.div
        className="flex flex-col items-center py-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <AlertCircle size={24} className="text-[#ef4444] mb-3" />
        <p className="text-[13px] text-[#dadadf] mb-1">Compatibility check failed</p>
        <p className="text-[11px] text-[#6e6e76] mb-5 max-w-sm text-center">{error}</p>
        <button
          onClick={() => hardware && check(buildProfile(hardware))}
          className="h-7 px-3 rounded-[5px] bg-[#1a1a1d] border border-[#2e2e32] text-[12px] text-[#a0a0a8] hover:bg-[#222225] transition-colors"
        >
          Retry
        </button>
      </motion.div>
    );
  }

  if (!displayReport) return null;

  const verdictColor = displayReport.overall === 'supported'
    ? '#22c55e'
    : displayReport.overall === 'partial'
      ? '#f59e0b'
      : '#ef4444';

  const verdictLabel = displayReport.overall === 'supported'
    ? 'Supported'
    : displayReport.overall === 'partial'
      ? 'Partial'
      : 'Unsupported';

  const components = [
    { name: 'CPU', ok: displayReport.cpuSupported },
    { name: 'GPU', ok: displayReport.gpuSupported },
    { name: 'Audio', ok: displayReport.audioSupported },
    { name: 'Network', ok: displayReport.networkSupported },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-[17px] font-semibold text-[#f0f0f2] mb-1">Compatibility</h2>
      <p className="text-[12px] text-[#6e6e76] mb-5">Hardware analysis for macOS.</p>

      {/* Verdict */}
      <motion.div
        className="flex items-center justify-between rounded-[6px] bg-[#0d0d0f] border border-[#1a1a1d] px-4 py-3.5 mb-4"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: verdictColor }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
          />
          <span className="text-[14px] font-medium text-[#f0f0f2]">{verdictLabel}</span>
        </div>
        <span className="text-[12px] text-[#6e6e76] tabular-nums">
          {Math.round(displayReport.confidence * 100)}% confidence
        </span>
      </motion.div>

      {/* Component status */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {components.map((c, i) => (
          <motion.div
            key={c.name}
            className="flex items-center gap-2 rounded-[5px] bg-[#0d0d0f] border border-[#1a1a1d] px-2.5 py-2"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05 }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${c.ok ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
            <span className="text-[11px] text-[#a0a0a8]">{c.name}</span>
          </motion.div>
        ))}
      </div>

      {/* Recommended OS */}
      {displayReport.recommendedOs && (
        <motion.div
          className="rounded-[6px] bg-[#0d0d0f] border border-[#1a1a1d] px-3.5 py-2.5 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          <span className="text-[11px] text-[#3e3e44] uppercase tracking-wide">Recommended</span>
          <p className="text-[13px] text-[#dadadf] mt-0.5">
            macOS {displayReport.recommendedOs}
          </p>
          {displayReport.supportedOsVersions.length > 1 && (
            <p className="text-[11px] text-[#3e3e44] mt-1">
              Also: {displayReport.supportedOsVersions.filter(v => v !== displayReport.recommendedOs).join(', ')}
            </p>
          )}
        </motion.div>
      )}

      {/* Issues */}
      {displayReport.issues.length > 0 && (
        <motion.div
          className="rounded-[6px] border border-[#1a1a1d] bg-[#0d0d0f] divide-y divide-[#1a1a1d] mb-6 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {displayReport.issues.map((issue, i) => (
            <motion.div
              key={i}
              className="px-3.5 py-2.5"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.45 + i * 0.05 }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] uppercase tracking-wide font-medium ${
                  issue.severity === 'warning' ? 'text-[#f59e0b]' : issue.severity === 'error' ? 'text-[#ef4444]' : 'text-[#3b82f6]'
                }`}>{issue.severity}</span>
                <span className="text-[12px] text-[#dadadf]">{issue.component}</span>
              </div>
              <p className="text-[11px] text-[#6e6e76]">{issue.message}</p>
              {issue.workaround && (
                <p className="text-[11px] text-[#3b82f6] mt-1">{issue.workaround}</p>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {advisoryNotes.length > 0 && (
        <motion.div
          className="rounded-[6px] border border-[#1a1a1d] bg-[#0d0d0f] divide-y divide-[#1a1a1d] mb-6 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.43 }}
        >
          <div className="px-3.5 py-2 border-b border-[#1a1a1d]">
            <p className="text-[10px] uppercase tracking-wide text-[#3e3e44]">Known Caveats</p>
          </div>
          {advisoryNotes.map((note, index) => (
            <motion.div
              key={`${note.title}-${index}`}
              className="px-3.5 py-2.5"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.48 + index * 0.05 }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`text-[10px] uppercase tracking-wide font-medium ${
                    note.tone === 'warning' ? 'text-[#f59e0b]' : 'text-[#3b82f6]'
                  }`}
                >
                  {note.tone}
                </span>
                <span className="text-[12px] text-[#dadadf]">{note.title}</span>
              </div>
              <p className="text-[11px] text-[#6e6e76]">{note.detail}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {displayReport.issues.length === 0 && (
        <motion.div
          className="rounded-[6px] border border-[#1a1a1d] bg-[#0d0d0f] px-3.5 py-4 text-center mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-[12px] text-[#6e6e76]">No compatibility issues found.</p>
        </motion.div>
      )}

      <motion.div
        className="flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.button
          onClick={handleContinue}
          disabled={displayReport.overall === 'unsupported'}
          className="h-8 px-3.5 rounded-[6px] bg-[#f0f0f2] text-[#09090b] text-[13px] font-medium hover:bg-[#dadadf] transition-colors duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
