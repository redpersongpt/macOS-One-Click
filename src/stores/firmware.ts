import { create } from 'zustand';
import type { FirmwareReport } from '../bridge/types';
import { api } from '../bridge/invoke';
import { parseError } from '../lib/parseError';

interface FirmwareStore {
  report: FirmwareReport | null;
  loading: boolean;
  error: string | null;

  probe: () => Promise<void>;
  clear: () => void;
}

export const useFirmware = create<FirmwareStore>((set) => ({
  report: null,
  loading: false,
  error: null,

  probe: async () => {
    set({ loading: true, error: null, report: null });
    try {
      const report = await api.probeFirmware();
      set({ report, loading: false });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, loading: false });
    }
  },

  clear: () => set({ report: null, loading: false, error: null }),
}));
