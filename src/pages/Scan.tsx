import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useWizard } from '../stores/wizard';
import { useHardware } from '../stores/hardware';
import Logo from '../components/Logo';
import { DEMO_HARDWARE } from '../lib/demoData';
import { Loader2, AlertCircle } from 'lucide-react';

export default function Scan() {
  const { goNext, markCompleted } = useWizard();
  const { hardware, scanning, error, scan, setHardware, isDemo } = useHardware();

  useEffect(() => {
    if (!hardware && !scanning) {
      scan();
    }
  }, [hardware, scanning, scan]);

  // Auto-fallback to demo on error
  useEffect(() => {
    if (error && !hardware) {
      setHardware(DEMO_HARDWARE, true);
    }
  }, [error, hardware, setHardware]);

  const handleContinue = () => {
    markCompleted('scan');
    goNext();
  };

  // Scanning
  if (scanning) {
    return (
      <motion.div
        className="flex flex-col items-center py-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        >
          <Loader2 size={24} className="text-[#6e6e76]" />
        </motion.div>
        <motion.p
          className="text-[13px] text-[#6e6e76] mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Detecting hardware...
        </motion.p>
      </motion.div>
    );
  }

  if (!hardware) return null;

  const rows: { label: string; value: string; sub?: string }[] = [
    { label: 'CPU', value: hardware.cpu.name, sub: hardware.cpu.generation ?? '' },
    ...(hardware.motherboard.chipset
      ? [{ label: 'Chipset', value: hardware.motherboard.chipset }]
      : []),
    ...hardware.gpu.map((g) => ({
      label: g.isIgpu ? 'iGPU' : 'dGPU',
      value: g.name,
      sub: g.vendor,
    })),
    ...(hardware.audio.length > 0
      ? [{ label: 'Audio', value: hardware.audio[0].codec ?? hardware.audio[0].name }]
      : []),
    ...hardware.network.map((n) => ({
      label: n.deviceType === 'ethernet' ? 'LAN' : 'Wi-Fi',
      value: n.chipset ?? n.name,
    })),
    ...(hardware.input.length > 0
      ? [{
          label: 'Input',
          value: hardware.input.map((device) => device.name).join(', '),
          sub: hardware.input.map((device) => device.deviceType.toUpperCase()).join(', '),
        }]
      : []),
    { label: 'RAM', value: `${Math.round(hardware.memory.totalMb / 1024)} GB`, sub: `${hardware.memory.slots.length} slots` },
    ...(hardware.storage.length > 0
      ? [{
          label: 'Disk',
          value: hardware.storage[0].name,
          sub: hardware.storage[0].mediaType ?? hardware.storage[0].interfaceType,
        }]
      : []),
    { label: 'Form', value: hardware.isLaptop ? 'Laptop' : 'Desktop' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {isDemo && (
        <motion.div
          className="flex items-center gap-2 rounded-[5px] bg-[#1a1a1d] border border-[#2e2e32] px-3 py-2 mb-5"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3 }}
        >
          <AlertCircle size={13} className="text-[#f59e0b] shrink-0" />
          <p className="text-[11px] text-[#6e6e76]">
            Demo mode — hardware scan requires Windows or Linux.
          </p>
        </motion.div>
      )}

      <h2 className="text-[17px] font-semibold text-[#f0f0f2] mb-1">Hardware</h2>
      <p className="text-[12px] text-[#6e6e76] mb-5">
        {hardware.motherboard.manufacturer} {hardware.motherboard.product}
      </p>

      <div className="rounded-[6px] border border-[#1a1a1d] bg-[#0d0d0f] divide-y divide-[#1a1a1d] mb-6 overflow-hidden">
        {rows.map((row, i) => (
          <motion.div
            key={i}
            className="flex items-center px-3.5 py-2.5"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.25 }}
          >
            <span className="text-[11px] text-[#3e3e44] w-12 shrink-0 uppercase tracking-wide">{row.label}</span>
            <span className="text-[12px] text-[#dadadf] flex-1">{row.value}</span>
            {row.sub && (
              <span className="text-[11px] text-[#3e3e44]">{row.sub}</span>
            )}
          </motion.div>
        ))}
      </div>

      <motion.div
        className="flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <motion.button
          onClick={handleContinue}
          className="h-8 px-3.5 rounded-[6px] bg-[#f0f0f2] text-[#09090b] text-[13px] font-medium hover:bg-[#dadadf] transition-colors duration-100"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
