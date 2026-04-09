import { create } from 'zustand';
import type { DetectedHardware } from '../bridge/types';
import { api } from '../bridge/invoke';
import { parseError } from '../lib/parseError';

interface HardwareStore {
  hardware: DetectedHardware | null;
  scanning: boolean;
  error: string | null;
  isDemo: boolean;

  scan: () => Promise<void>;
  setHardware: (hw: DetectedHardware, demo?: boolean) => void;
  clear: () => void;
}

export const useHardware = create<HardwareStore>((set) => ({
  hardware: null,
  scanning: false,
  error: null,
  isDemo: false,

  scan: async () => {
    set({ scanning: true, error: null });
    try {
      const hardware = await api.scanHardware();
      set({ hardware, scanning: false, isDemo: false });
    } catch (err: unknown) {
      set({ error: parseError(err), scanning: false });
    }
  },

  setHardware: (hw, demo = false) =>
    set({ hardware: hw, scanning: false, error: null, isDemo: demo }),

  clear: () => set({ hardware: null, error: null, isDemo: false }),
}));
