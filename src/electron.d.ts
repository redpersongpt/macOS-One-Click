export {};
import type { BiosSettingSelection } from '../electron/bios/types';

declare global {
  interface Window {
    electron: {
      platform: NodeJS.Platform;
      scanHardware: () => Promise<{
        profile: import('../electron/configGenerator').HardwareProfile;
        interpretation: import('../electron/hardwareInterpret').HardwareInterpretation | null;
        artifact: import('../electron/hardwareProfileArtifact').HardwareProfileArtifact;
      }>;
      getLatestHardwareProfile: () => Promise<import('../electron/hardwareProfileArtifact').HardwareProfileArtifact | null>;
      saveHardwareProfile: (payload: {
        profile: import('../electron/configGenerator').HardwareProfile;
        interpretation?: import('../electron/hardwareProfileArtifact').HardwareProfileInterpretationMetadata | null;
        source?: import('../electron/hardwareProfileArtifact').HardwareProfileArtifact['source'];
      }) => Promise<import('../electron/hardwareProfileArtifact').HardwareProfileArtifact>;
      exportHardwareProfile: (artifact?: import('../electron/hardwareProfileArtifact').HardwareProfileArtifact | null) => Promise<{
        filePath: string;
        artifact: import('../electron/hardwareProfileArtifact').HardwareProfileArtifact;
      } | null>;
      importHardwareProfile: () => Promise<import('../electron/hardwareProfileArtifact').HardwareProfileArtifact | null>;
      inspectEfiBackupPolicy: (device: string) => Promise<import('../electron/efiBackup').EfiBackupPolicy>;
      buildEFI: (profile: any, allowAcceptedSession?: boolean) => Promise<string>;
      fetchLatestKexts: (efiPath: string, kextNames: string[]) => Promise<Array<{ name: string; version: string; source?: 'github' | 'embedded' | 'direct' | 'failed' }>>;
      downloadRecovery: (targetPath: string, macOSVersion: string, startOffset?: number) => Promise<{ dmgPath: string; recoveryDir: string }>;
      listUsbDevices: () => Promise<Array<{ name: string; device: string; size: string }>>;
      prepareFlashConfirmation: (device: string, efiPath: string, expectedIdentity?: { devicePath?: string; sizeBytes?: number; model?: string; vendor?: string; serialNumber?: string; transport?: string; removable?: boolean; partitionTable?: string }) => Promise<{ token: string; expiresAt: number; diskInfo: any; backupPolicy: import('../electron/efiBackup').EfiBackupPolicy }>;
      flashUsb: (device: string, efiPath: string, confirmed: boolean, confirmationToken?: string | null) => Promise<boolean>;
      validateEfi: (efiPath: string, profile?: any | null) => Promise<import('../electron/configValidator').ValidationResult>;
      enableProductionLock: (efiPath: string, targetOS?: string) => Promise<boolean>;
      getBiosState: (profile: any) => Promise<import('../electron/bios/types').BiosOrchestratorState>;
      applySupportedBiosChanges: (profile: any, selectedChanges: Record<string, BiosSettingSelection>) => Promise<{ state: import('../electron/bios/types').BiosOrchestratorState; appliedCount: number; message: string }>;
      verifyManualBiosChanges: (profile: any, selectedChanges: Record<string, BiosSettingSelection>) => Promise<import('../electron/bios/types').BiosOrchestratorState>;
      continueBiosWithCurrentState: (profile: any, selectedChanges: Record<string, BiosSettingSelection>) => Promise<import('../electron/bios/types').BiosOrchestratorState>;
      restartToFirmwareWithSession: (profile: any, selectedChanges: Record<string, BiosSettingSelection>) => Promise<{ supported: boolean; error?: string; state: import('../electron/bios/types').BiosOrchestratorState }>;
      clearBiosSession: () => Promise<boolean>;
      getBiosResumeState: () => Promise<import('../electron/bios/types').BiosResumeStateResponse>;
      getBiosRestartCapability: () => Promise<import('../electron/bios/types').FirmwareRestartCapability>;
      guardBuild: (profile: any, allowAcceptedSession?: boolean) => Promise<import('./lib/stateMachine').FlowGuardResult>;
      guardDeploy: (profile: any, efiPath: string) => Promise<import('./lib/stateMachine').FlowGuardResult>;
      openFolder: (folderPath: string) => Promise<void>;
      getLogPath: () => Promise<string>;
      getPersistedState: () => Promise<any>;
      saveState: (state: any) => Promise<void>;
      clearState: () => Promise<void>;
      probeBios: () => Promise<any>;
      probeFirmware: () => Promise<any>;
      restartComputer: () => Promise<void>;
      restartToBios: () => Promise<{ supported: boolean; error?: string }>;
      disableAutostart: () => Promise<void>;
      getHardDrives: () => Promise<any[]>;
      convertDiskToGpt: (disk: string, confirmed: boolean) => Promise<import('../electron/diskOps').DiskInfo>;
      shrinkPartition: (disk: string, sizeGB: number, confirmed: boolean) => Promise<void>;
      createBootPartition: (disk: string, efiPath: string, confirmed: boolean, profile?: any | null) => Promise<void>;
      getDownloadResumeState: () => Promise<any>;
      runPreflight: () => Promise<any>;
      getDiskInfo: (device: string) => Promise<any>;
      onTaskUpdate: (callback: (payload: any) => void) => () => void;
      taskList: () => Promise<any[]>;
      taskCancel: (taskId: string) => Promise<void>;
      getLogTail: (n: number) => Promise<any[]>;
      getOpsTail: (n: number) => Promise<any[]>;
      logClear: () => Promise<boolean>;
      getSessionId: () => Promise<string>;
      reportIssue: (extraContext?: string | null) => Promise<{ success: boolean; body: string; baseUrl: string }>;
      openLatestReleasePage: () => Promise<boolean>;
      getAppUpdateState: () => Promise<import('../electron/appUpdater').AppUpdateState>;
      checkForUpdates: () => Promise<import('../electron/appUpdater').AppUpdateState>;
      downloadLatestUpdate: () => Promise<import('../electron/appUpdater').AppUpdateState>;
      installLatestUpdate: () => Promise<import('../electron/appUpdater').AppUpdateState>;
      quitForUpdate: () => Promise<boolean>;
      importRecovery: (targetPath: string, macOSVersion: string) => Promise<{ dmgPath: string; recoveryDir: string } | null>;
      getCachedRecoveryInfo: (version: string) => Promise<any>;
      clearRecoveryCache: (version: string) => Promise<boolean>;
      runPrechecks: () => Promise<{
        platform: string;
        adminPrivileges: boolean;
        adminNote: string | null;
        freeSpaceMB: number;
        networkOk: boolean;
        usbDetected: boolean;
        firmwareDetectionAvailable: boolean;
        missingBinaries: string[];
      }>;
      // Prevention Layer
      runPreflightChecks: (kextNames: string[]) => Promise<any>;
      recordFailure: (code: string, message: string) => Promise<any>;
      shouldSkipRetry: (code: string) => Promise<boolean>;
      getFailureMemory: () => Promise<any[]>;
      clearFailureMemory: () => Promise<boolean>;
      // Deterministic Layer
      simulateBuild: (kextNames: string[], ssdtNames: string[], smbios: string) => Promise<any>;
      dryRunRecovery: (targetOS: string, smbios: string) => Promise<any>;
      verifyBuildState: (efiPath: string, requiredKexts: string[]) => Promise<any>;
      verifyEfiBuildSuccess: (efiPath: string, requiredKexts: string[], requiredSsdts?: string[]) => Promise<any>;
      verifyRecoverySuccess: (recoveryDir: string) => Promise<any>;
      runSafeSimulation: (profile: import('../electron/configGenerator').HardwareProfile) => Promise<any>;
      getResourcePlan: (profile: import('../electron/configGenerator').HardwareProfile, efiPath?: string | null) => Promise<any>;
      getDiagnostics: () => Promise<any>;
      saveSupportLog: (extraContext?: string | null) => Promise<{ fileName: string; savedTo: 'Desktop' }>;
      logUiEvent: (eventName: string, detail?: Record<string, unknown> | null) => Promise<boolean>;
      notifyRendererReady: () => Promise<boolean>;
    };
  }
}
