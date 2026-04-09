import { create } from 'zustand';
import type { CompatibilityReport, HardwareProfile } from '../bridge/types';
import { api } from '../bridge/invoke';
import { parseError } from '../lib/parseError';

interface CompatibilityStore {
  report: CompatibilityReport | null;
  loading: boolean;
  error: string | null;
  selectedTargetOs: string | null;

  check: (profile: HardwareProfile) => Promise<void>;
  setSelectedTargetOs: (targetOs: string | null) => void;
  clear: () => void;
}

export const useCompatibility = create<CompatibilityStore>((set) => ({
  report: null,
  loading: false,
  error: null,
  selectedTargetOs: null,

  check: async (profile) => {
    set({ loading: true, error: null, report: null });
    try {
      const report = await api.checkCompatibility(profile);
      set((state) => {
        const nextTargetOs = state.selectedTargetOs && report.supportedOsVersions.includes(state.selectedTargetOs)
          ? state.selectedTargetOs
          : report.recommendedOs ?? report.supportedOsVersions[0] ?? null;

        return { report, loading: false, selectedTargetOs: nextTargetOs };
      });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, loading: false });
    }
  },

  setSelectedTargetOs: (selectedTargetOs) => set({ selectedTargetOs }),

  clear: () => set({ report: null, loading: false, error: null, selectedTargetOs: null }),
}));
