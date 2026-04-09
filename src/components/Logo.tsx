import { motion } from 'motion/react';

interface LogoProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function Logo({ size = 32, className = '', animate = false }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="opcore-ring" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.92" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="opcore-core" x1="32" y1="24" x2="71" y2="76" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8fafc" />
          <stop offset="0.52" stopColor="#d9dde7" />
          <stop offset="1" stopColor="#8e97ab" />
        </linearGradient>
        <radialGradient id="opcore-blue" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(74 22) rotate(135) scale(20)">
          <stop stopColor="#9bd1ff" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
      </defs>

      <motion.circle
        cx="50"
        cy="50"
        r="45"
        stroke="url(#opcore-ring)"
        strokeWidth="2"
        strokeDasharray="7 9"
        fill="none"
        initial={animate ? { opacity: 0, rotate: -24 } : false}
        animate={animate ? { opacity: 1, rotate: 0 } : undefined}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: '50px 50px' }}
      />

      <motion.circle
        cx="50"
        cy="50"
        r="34"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.5"
        fill="none"
        initial={animate ? { opacity: 0, scale: 0.92 } : false}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ delay: 0.14, duration: 0.45 }}
      />

      <motion.path
        d="M50 17L73 28V54C73 67 63.8 77.6 50 83C36.2 77.6 27 67 27 54V28L50 17Z"
        fill="url(#opcore-core)"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth="1"
        initial={animate ? { opacity: 0, scale: 0.86 } : false}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ delay: 0.18, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: '50px 50px' }}
      />

      <motion.path
        d="M63 33.5C58.9 29.9 54 28 48.7 28C35.2 28 25.2 38 25.2 50.5C25.2 63 35.2 73 48.7 73C54 73 58.9 71.1 63 67.5"
        stroke="url(#opcore-core)"
        strokeWidth="9.5"
        strokeLinecap="round"
        fill="none"
        initial={animate ? { pathLength: 0, opacity: 0 } : false}
        animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ delay: 0.28, duration: 0.55, ease: 'easeOut' }}
      />

      <motion.path
        d="M58 34L43 67"
        stroke="#f0f4ff"
        strokeWidth="7"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0, opacity: 0 } : false}
        animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ delay: 0.44, duration: 0.4, ease: 'easeOut' }}
      />

      <motion.path
        d="M34 50H67"
        stroke="currentColor"
        strokeOpacity="0.14"
        strokeWidth="1.2"
        strokeDasharray="2 4"
        initial={animate ? { opacity: 0 } : false}
        animate={animate ? { opacity: 1 } : undefined}
        transition={{ delay: 0.4, duration: 0.25 }}
      />

      <motion.path
        d="M50 34V66"
        stroke="currentColor"
        strokeOpacity="0.14"
        strokeWidth="1.2"
        strokeDasharray="2 4"
        initial={animate ? { opacity: 0 } : false}
        animate={animate ? { opacity: 1 } : undefined}
        transition={{ delay: 0.4, duration: 0.25 }}
      />

      <motion.circle
        cx="74"
        cy="22"
        r="11"
        fill="url(#opcore-blue)"
        initial={animate ? { opacity: 0, scale: 0.3 } : false}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ delay: 0.62, duration: 0.35 }}
      />

      <motion.circle
        cx="74"
        cy="22"
        r="4.5"
        fill="#4ea6ff"
        initial={animate ? { opacity: 0, scale: 0 } : false}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ delay: 0.68, duration: 0.28, type: 'spring', stiffness: 380, damping: 16 }}
      />

      <motion.path
        d="M72 33L63.5 41"
        stroke="#4ea6ff"
        strokeOpacity="0.75"
        strokeWidth="2"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0, opacity: 0 } : false}
        animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ delay: 0.7, duration: 0.22 }}
      />
    </svg>
  );
}
