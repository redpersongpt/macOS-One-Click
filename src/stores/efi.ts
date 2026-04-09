import { create } from 'zustand';
import type { BuildResult, ValidationResult, HardwareProfile } from '../bridge/types';
import { api } from '../bridge/invoke';
import { parseError } from '../lib/parseError';

interface EfiStore {
  buildResult: BuildResult | null;
  validationResult: ValidationResult | null;
  building: boolean;
  validating: boolean;
  error: string | null;

  build: (profile: HardwareProfile, targetOs: string) => Promise<void>;
  validate: (path: string) => Promise<void>;
  setBuildResult: (buildResult: BuildResult | null) => void;
  setValidationResult: (validationResult: ValidationResult | null) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useEfi = create<EfiStore>((set) => ({
  buildResult: null,
  validationResult: null,
  building: false,
  validating: false,
  error: null,

  build: async (profile, targetOs) => {
    set({ building: true, error: null, buildResult: null, validationResult: null });
    try {
      const buildResult = await api.buildEfi(profile, targetOs);
      set({ buildResult, building: false });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, building: false });
    }
  },

  validate: async (path) => {
    set({ validating: true, error: null, validationResult: null });
    try {
      const validationResult = await api.validateEfi(path);
      set({ validationResult, validating: false });
    } catch (err) {
      const message = parseError(err);
      set({ error: message, validating: false });
    }
  },

  setBuildResult: (buildResult) =>
    set({ buildResult, building: false, error: null }),

  setValidationResult: (validationResult) =>
    set({ validationResult, validating: false, error: null }),

  setError: (error) =>
    set({ error, building: false, validating: false }),

  clear: () =>
    set({
      buildResult: null,
      validationResult: null,
      building: false,
      validating: false,
      error: null,
    }),
}));
