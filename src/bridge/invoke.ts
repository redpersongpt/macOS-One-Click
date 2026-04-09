import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type {
  DetectedHardware,
  HardwareProfile,
  BuildResult,
  ValidationResult,
  DiskInfo,
  FlashConfirmation,
  FirmwareReport,
  PersistedState,
  TaskUpdate,
  CompatibilityReport,
  RecoveryCacheInfo,
} from './types';

/**
 * Typed Tauri command invocations.
 * Each method maps 1:1 to a #[tauri::command] in the Rust backend.
 */
export const api = {
  // ── Hardware ────────────────────────────────────────────────
  scanHardware: () =>
    tauriInvoke<DetectedHardware>('scan_hardware'),

  // ── State ──────────────────────────────────────────────────
  getPersistedState: () =>
    tauriInvoke<PersistedState>('get_persisted_state'),

  saveState: (state: PersistedState) =>
    tauriInvoke<void>('save_state', { state }),

  clearState: () =>
    tauriInvoke<void>('clear_state'),

  // ── Tasks ──────────────────────────────────────────────────
  taskList: () =>
    tauriInvoke<TaskUpdate[]>('task_list'),

  taskCancel: (taskId: string) =>
    tauriInvoke<boolean>('task_cancel', { taskId }),

  // ── EFI Build ──────────────────────────────────────────────
  buildEfi: (profile: HardwareProfile, targetOs: string) =>
    tauriInvoke<BuildResult>('build_efi', { profile, targetOs }),

  validateEfi: (path: string) =>
    tauriInvoke<ValidationResult>('validate_efi', { path }),

  checkCompatibility: (profile: HardwareProfile) =>
    tauriInvoke<CompatibilityReport>('check_compatibility', { profile }),

  // ── Disk ──────────────────────────────────────────────────
  listUsbDevices: () =>
    tauriInvoke<DiskInfo[]>('list_usb_devices'),

  getDiskInfo: (device: string) =>
    tauriInvoke<DiskInfo>('get_disk_info', { device }),

  prepareFlashConfirmation: (device: string, efiPath: string) =>
    tauriInvoke<FlashConfirmation>('flash_prepare_confirmation', { device, efiPath }),

  flashUsb: (device: string, efiPath: string, token: string) =>
    tauriInvoke<void>('flash_usb', { device, efiPath, token }),

  // ── Firmware ──────────────────────────────────────────────
  probeFirmware: () =>
    tauriInvoke<FirmwareReport>('probe_firmware'),

  // ── Recovery ──────────────────────────────────────────────
  downloadRecovery: (targetOs: string) =>
    tauriInvoke<void>('download_recovery', { targetOs }),

  getCachedRecoveryInfo: () =>
    tauriInvoke<RecoveryCacheInfo>('get_cached_recovery_info'),

  clearRecoveryCache: () =>
    tauriInvoke<void>('clear_recovery_cache'),

  // ── Logging ───────────────────────────────────────────────
  logGetSessionId: () =>
    tauriInvoke<string>('log_get_session_id'),

  logGetTail: (lines?: number) =>
    tauriInvoke<string>('log_get_tail', { lines }),

  saveSupportLog: (path: string) =>
    tauriInvoke<void>('save_support_log', { path }),

  clearAppCache: () =>
    tauriInvoke<void>('clear_app_cache'),
} as const;
