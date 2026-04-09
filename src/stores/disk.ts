import { create } from 'zustand';
import type { DiskInfo, FlashConfirmation } from '../bridge/types';
import { api } from '../bridge/invoke';
import { parseError } from '../lib/parseError';

interface DiskStore {
  devices: DiskInfo[];
  selectedDevice: string | null;
  flashConfirmation: FlashConfirmation | null;
  loading: boolean;
  flashing: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  select: (device: string) => void;
  prepareFlash: (efiPath: string) => Promise<void>;
  flash: (efiPath: string, token: string) => Promise<void>;
  setDevices: (devices: DiskInfo[]) => void;
  setFlashConfirmation: (flashConfirmation: FlashConfirmation | null) => void;
  setError: (error: string | null) => void;
  setFlashing: (flashing: boolean) => void;
  clear: () => void;
}

export const useDisk = create<DiskStore>((set, get) => ({
  devices: [],
  selectedDevice: null,
  flashConfirmation: null,
  loading: false,
  flashing: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const devices = await api.listUsbDevices();
      set({ devices, loading: false });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, loading: false });
    }
  },

  select: (device) => set({ selectedDevice: device, flashConfirmation: null }),

  prepareFlash: async (efiPath) => {
    const { selectedDevice } = get();
    if (!selectedDevice) return;
    set({ loading: true, error: null, flashConfirmation: null });
    try {
      const flashConfirmation = await api.prepareFlashConfirmation(selectedDevice, efiPath);
      set({ flashConfirmation, loading: false });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, loading: false });
    }
  },

  flash: async (efiPath, token) => {
    const { selectedDevice } = get();
    if (!selectedDevice) return;
    set({ flashing: true, error: null });
    try {
      await api.flashUsb(selectedDevice, efiPath, token);
      set({ flashing: false });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, flashing: false });
    }
  },

  setDevices: (devices) =>
    set({ devices, loading: false, error: null }),

  setFlashConfirmation: (flashConfirmation) =>
    set({ flashConfirmation, loading: false, error: null }),

  setError: (error) =>
    set({ error, loading: false, flashing: false }),

  setFlashing: (flashing) =>
    set({ flashing }),

  clear: () =>
    set({
      devices: [],
      selectedDevice: null,
      flashConfirmation: null,
      loading: false,
      flashing: false,
      error: null,
    }),
}));
