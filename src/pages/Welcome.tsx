import { motion } from 'motion/react';
import { useWizard } from '../stores/wizard';
import { useHardware } from '../stores/hardware';
import { useCompatibility } from '../stores/compatibility';
import { useFirmware } from '../stores/firmware';
import { useEfi } from '../stores/efi';
import { useDisk } from '../stores/disk';
import { useTasks } from '../stores/tasks';
import Logo from '../components/Logo';

export default function Welcome() {
  const { goNext, markCompleted } = useWizard();
  const clearHardware = useHardware((s) => s.clear);
  const clearCompatibility = useCompatibility((s) => s.clear);
  const clearFirmware = useFirmware((s) => s.clear);
  const clearEfi = useEfi((s) => s.clear);
  const clearDisk = useDisk((s) => s.clear);
  const clearTasks = useTasks((s) => s.clear);

  const handleStart = () => {
    clearTasks();
    clearDisk();
    clearEfi();
    clearFirmware();
    clearCompatibility();
    clearHardware();
    markCompleted('welcome');
    goNext();
  };

  return (
    <motion.div
      className="flex flex-col items-center pt-16 pb-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Glow behind logo */}
      <motion.div
        className="relative mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="absolute -inset-8 rounded-full bg-[#3b82f6]/[0.06] blur-2xl" />
        <Logo size={72} className="relative text-[#e0e0e6]" animate />
      </motion.div>

      <motion.h1
        className="text-[20px] font-semibold text-[#f0f0f2] tracking-tight mb-1.5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        OpCore-OneClick
      </motion.h1>

      <motion.p
        className="text-[12px] text-[#5a5a62] mb-10 text-center max-w-[280px] leading-relaxed"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
      >
        Build OpenCore EFI configurations from your hardware. Detect, configure, deploy.
      </motion.p>

      <motion.button
        onClick={handleStart}
        className="h-9 px-6 rounded-[7px] bg-[#f0f0f2] text-[#09090b] text-[13px] font-semibold hover:bg-white active:bg-[#c0c0c6] transition-all duration-150 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(59,130,246,0.25)' }}
        whileTap={{ scale: 0.97 }}
      >
        Get Started
      </motion.button>

      <motion.div
        className="mt-10 flex items-center gap-4 text-[10px] text-[#3a3a42]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        <span>Windows</span>
        <span className="w-[3px] h-[3px] rounded-full bg-[#2a2a30]" />
        <span>Linux</span>
        <span className="w-[3px] h-[3px] rounded-full bg-[#2a2a30]" />
        <span>Admin Required</span>
      </motion.div>
    </motion.div>
  );
}
