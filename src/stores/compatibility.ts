import { create } from 'zustand';
import type { CompatibilityReport, HardwareProfile } from '../bridge/types';
import { api } from '../bridge/invoke';
import { parseError } from '../lib/parseError';

interface CompatibilityStore {
  report: CompatibilityReport | null;
  loading: boolean;
  error: string | null;

  check: (profile: HardwareProfile) => Promise<void>;
  clear: () => void;
}

export const useCompatibility = create<CompatibilityStore>((set) => ({
  report: null,
  loading: false,
  error: null,

  check: async (profile) => {
    set({ loading: true, error: null, report: null });
    try {
      const report = await api.checkCompatibility(profile);
      set({ report, loading: false });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, loading: false });
    }
  },

  clear: () => set({ report: null, loading: false, error: null }),
}));
