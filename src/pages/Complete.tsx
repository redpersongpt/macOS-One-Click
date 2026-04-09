import { motion } from 'motion/react';
import { useWizard } from '../stores/wizard';
import Logo from '../components/Logo';

export default function Complete() {
  const { reset } = useWizard();

  return (
    <motion.div
      className="flex flex-col items-center pt-16 pb-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Success glow */}
      <motion.div
        className="relative mb-8"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
      >
        <div className="absolute -inset-10 rounded-full bg-[#22c55e]/[0.06] blur-3xl" />
        <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20">
          <motion.svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
          >
            <motion.polyline
              points="20 6 9 17 4 12"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.4, duration: 0.4, ease: 'easeOut' }}
            />
          </motion.svg>
        </div>
      </motion.div>

      <motion.h2
        className="text-[20px] font-semibold text-[#f0f0f2] mb-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        EFI Ready
      </motion.h2>

      <motion.p
        className="text-[12px] text-[#5a5a62] mb-10 text-center max-w-[300px] leading-relaxed"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        Your OpenCore EFI has been generated and deployed.
        Boot from the USB drive to start macOS installation.
      </motion.p>

      <motion.button
        onClick={reset}
        className="h-8 px-4 rounded-[6px] bg-[#141416] border border-[#1e1e22] text-[12px] text-[#6e6e76] hover:text-[#a0a0a8] hover:border-[#2e2e32] transition-all duration-150"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Start Over
      </motion.button>
    </motion.div>
  );
}
