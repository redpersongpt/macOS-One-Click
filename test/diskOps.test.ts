import { describe, it, expect } from 'vitest';
import {
  assessWindowsFlashPreparationState,
  buildWindowsPhysicalDrivePath,
  isWindowsUsbLikeDisk,
  getWindowsFat32PartitionSizeMB,
  shouldRetryWindowsFlashPreparation,
  buildLinuxFirstPartitionPath,
  buildWindowsFlashDiskpartScript,
  buildWindowsBootPartitionDiskpartScript,
} from '../electron/diskOps.js';

// ─── Windows disk path normalization ─────────────────────────────────────────

describe('buildWindowsPhysicalDrivePath', () => {
  it('normalizes disk0 alias to PhysicalDrive0', () => {
    expect(buildWindowsPhysicalDrivePath('disk0')).toBe('\\\\.\\PhysicalDrive0');
  });

  it('normalizes disk2 alias (case-insensitive)', () => {
    expect(buildWindowsPhysicalDrivePath('Disk2')).toBe('\\\\.\\PhysicalDrive2');
  });

  it('normalizes full PhysicalDrive path', () => {
    expect(buildWindowsPhysicalDrivePath('\\\\.\\PhysicalDrive3')).toBe('\\\\.\\PhysicalDrive3');
  });

  it('normalizes bare number', () => {
    expect(buildWindowsPhysicalDrivePath('1')).toBe('\\\\.\\PhysicalDrive1');
  });

  it('normalizes number as integer', () => {
    expect(buildWindowsPhysicalDrivePath(4)).toBe('\\\\.\\PhysicalDrive4');
  });

  it('handles whitespace', () => {
    expect(buildWindowsPhysicalDrivePath('  disk5  ')).toBe('\\\\.\\PhysicalDrive5');
  });
});

// ─── Windows USB detection ───────────────────────────────────────────────────

describe('isWindowsUsbLikeDisk', () => {
  it('detects BusType USB', () => {
    expect(isWindowsUsbLikeDisk({ busType: 'USB' })).toBe(true);
  });

  it('detects InterfaceType USB', () => {
    expect(isWindowsUsbLikeDisk({ interfaceType: 'USB' })).toBe(true);
  });

  it('detects USBSTOR in PNPDeviceID', () => {
    expect(isWindowsUsbLikeDisk({ pnpDeviceId: 'USBSTOR\\DISK&VEN_KINGSTON' })).toBe(true);
  });

  it('detects USB\\ prefix in PNPDeviceID', () => {
    expect(isWindowsUsbLikeDisk({ pnpDeviceId: 'USB\\VID_0781&PID_5583' })).toBe(true);
  });

  it('detects REMOVABLE in MediaType', () => {
    expect(isWindowsUsbLikeDisk({ mediaType: 'Removable Media' })).toBe(true);
  });

  it('rejects system boot disk even with USB bus', () => {
    expect(isWindowsUsbLikeDisk({ busType: 'USB', isBoot: true })).toBe(false);
  });

  it('rejects system disk even with USB bus', () => {
    expect(isWindowsUsbLikeDisk({ busType: 'USB', isSystem: true })).toBe(false);
  });

  it('rejects NVMe internal disk', () => {
    expect(isWindowsUsbLikeDisk({ busType: 'NVMe', interfaceType: 'SCSI' })).toBe(false);
  });

  it('rejects SATA internal disk', () => {
    expect(isWindowsUsbLikeDisk({ busType: 'SATA', interfaceType: 'IDE' })).toBe(false);
  });

  it('handles all null/undefined fields', () => {
    expect(isWindowsUsbLikeDisk({})).toBe(false);
  });

  it('case-insensitive matching', () => {
    expect(isWindowsUsbLikeDisk({ busType: 'usb' })).toBe(true);
  });
});

// ─── FAT32 partition size cap ────────────────────────────────────────────────

describe('getWindowsFat32PartitionSizeMB', () => {
  it('returns 30000 MB for 64 GB drive', () => {
    expect(getWindowsFat32PartitionSizeMB(64_000_000_000)).toBe(30_000);
  });

  it('returns 30000 MB for 256 GB drive', () => {
    expect(getWindowsFat32PartitionSizeMB(256_000_000_000)).toBe(30_000);
  });

  it('returns undefined for 16 GB drive (use full size)', () => {
    expect(getWindowsFat32PartitionSizeMB(16_000_000_000)).toBeUndefined();
  });

  it('returns undefined for exactly 32 GB (boundary)', () => {
    expect(getWindowsFat32PartitionSizeMB(32_000_000_000)).toBeUndefined();
  });

  it('returns 30000 for just over 32 GB', () => {
    expect(getWindowsFat32PartitionSizeMB(32_000_000_001)).toBe(30_000);
  });
});

// ─── Diskpart retry logic ────────────────────────────────────────────────────

describe('shouldRetryWindowsFlashPreparation', () => {
  it('retries on first diskpart failure with no drive letter', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: '', stage: 'create-partition',
    })).toBe(true);
  });

  it('does NOT retry on last attempt', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 1, maxAttempts: 2, diskpartFailed: true, driveLetter: '', stage: 'create-partition',
    })).toBe(false);
  });

  it('does NOT retry when diskpart succeeded', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: false, driveLetter: '', stage: 'create-partition',
    })).toBe(false);
  });

  it('does NOT retry when drive letter was assigned', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: 'E', stage: 'assign',
    })).toBe(false);
  });
});

// ─── Diskpart script generation ──────────────────────────────────────────────

describe('buildWindowsFlashDiskpartScript', () => {
  it('includes select disk N', () => {
    const script = buildWindowsFlashDiskpartScript('3');
    expect(script).toContain('select disk 3');
  });

  it('creates full-size partition when no sizeMB', () => {
    const script = buildWindowsFlashDiskpartScript('1');
    expect(script).toContain('create partition primary noerr');
    expect(script).not.toContain('size=');
  });

  it('creates capped partition when sizeMB given', () => {
    const script = buildWindowsFlashDiskpartScript('2', 30000);
    expect(script).toContain('create partition primary size=30000 noerr');
  });

  it('converts to GPT', () => {
    const script = buildWindowsFlashDiskpartScript('0');
    expect(script).toContain('convert gpt noerr');
  });

  it('formats as FAT32 with OPENCORE label', () => {
    const script = buildWindowsFlashDiskpartScript('0');
    expect(script).toContain('format fs=fat32 quick label=OPENCORE noerr');
  });

  it('explicitly re-selects partition 1 before format', () => {
    const script = buildWindowsFlashDiskpartScript('0');
    expect(script).toContain('select partition 1 noerr');
  });
});

// ─── Diskpart script input validation ────────────────────────────────────────

describe('buildWindowsFlashDiskpartScript — input validation', () => {
  it('uses partition size cap for large drives', () => {
    const script = buildWindowsFlashDiskpartScript('2', 30000);
    expect(script).toContain('create partition primary size=30000 noerr');
    expect(script).toContain('select disk 2');
  });

  it('uses full partition for small drives', () => {
    const script = buildWindowsFlashDiskpartScript('1');
    expect(script).toContain('create partition primary noerr');
    expect(script).not.toContain('size=');
  });
});

// ─── Diskpart retry logic — partition not created (#11, #15, #16) ───────────

describe('shouldRetryWindowsFlashPreparation — failure modes', () => {
  it('retries when diskpart failed and no drive letter', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: '', stage: 'format',
    })).toBe(true);
  });

  it('does NOT retry on last attempt even if diskpart failed', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 1, maxAttempts: 2, diskpartFailed: true, driveLetter: '', stage: 'assign',
    })).toBe(false);
  });

  it('does NOT retry when diskpart succeeded', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: false, driveLetter: '', stage: 'assign',
    })).toBe(false);
  });

  it('does NOT retry when drive letter was found despite error', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: 'E', stage: 'label-lookup',
    })).toBe(false);
  });

  it('does NOT retry label lookup failure when a partition fallback exists', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: 'F', stage: 'label-lookup',
    })).toBe(false);
  });
});

// ─── Diskpart script: mandatory commands present ─────────────────────────────

describe('buildWindowsFlashDiskpartScript — safety commands', () => {
  it('always clears readonly first', () => {
    const script = buildWindowsFlashDiskpartScript('1');
    const lines = script.split('\n');
    const selectIdx = lines.findIndex(l => l.includes('select disk'));
    const readonlyIdx = lines.findIndex(l => l.includes('attributes disk clear readonly'));
    expect(readonlyIdx).toBeGreaterThan(selectIdx);
  });

  it('always runs clean before convert', () => {
    const script = buildWindowsFlashDiskpartScript('0');
    const lines = script.split('\n');
    const cleanIdx = lines.findIndex(l => l === 'clean noerr');
    const convertIdx = lines.findIndex(l => l.includes('convert gpt'));
    expect(cleanIdx).toBeLessThan(convertIdx);
  });

  it('always assigns after format', () => {
    const script = buildWindowsFlashDiskpartScript('0');
    const lines = script.split('\n');
    const formatIdx = lines.findIndex(l => l.includes('format fs=fat32'));
    const assignIdx = lines.findIndex(l => l === 'assign noerr');
    expect(assignIdx).toBeGreaterThan(formatIdx);
  });

  it('selects partition 1 between create and format', () => {
    const script = buildWindowsFlashDiskpartScript('0');
    const lines = script.split('\n');
    const createIdx = lines.findIndex(l => l.startsWith('create partition primary'));
    const selectPartitionIdx = lines.findIndex(l => l === 'select partition 1 noerr');
    const formatIdx = lines.findIndex(l => l.includes('format fs=fat32'));
    expect(selectPartitionIdx).toBeGreaterThan(createIdx);
    expect(formatIdx).toBeGreaterThan(selectPartitionIdx);
  });

  it('ends with rescan', () => {
    const script = buildWindowsFlashDiskpartScript('0');
    const lines = script.split('\n').filter(l => l.length > 0);
    expect(lines[lines.length - 1]).toBe('rescan');
  });
});

// ─── Retry logic boundary conditions ─────────────────────────────────────────

describe('shouldRetryWindowsFlashPreparation — boundary conditions', () => {
  it('retries at attempt 0 out of 3', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 3, diskpartFailed: true, driveLetter: '', stage: 'create-partition',
    })).toBe(true);
  });

  it('retries at attempt 1 out of 3', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 1, maxAttempts: 3, diskpartFailed: true, driveLetter: '', stage: 'format',
    })).toBe(true);
  });

  it('does NOT retry at attempt 2 out of 3 (last attempt)', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 2, maxAttempts: 3, diskpartFailed: true, driveLetter: '', stage: 'assign',
    })).toBe(false);
  });

  it('does NOT retry with maxAttempts=1 (single attempt only)', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 1, diskpartFailed: true, driveLetter: '', stage: 'create-partition',
    })).toBe(false);
  });
});

describe('assessWindowsFlashPreparationState', () => {
  it('classifies no partitions as create failure', () => {
    const assessment = assessWindowsFlashPreparationState({
      partitions: [],
      expectedLabel: 'OPENCORE',
    });
    expect(assessment.status).toBe('failed');
    expect(assessment.stage).toBe('create-partition');
  });

  it('classifies raw partition as format failure', () => {
    const assessment = assessWindowsFlashPreparationState({
      partitions: [{
        partitionNumber: 1,
        driveLetter: '',
        fileSystem: '',
        fileSystemLabel: '',
        sizeBytes: 15_264_000_000,
      }],
      expectedLabel: 'OPENCORE',
    });
    expect(assessment.status).toBe('failed');
    expect(assessment.stage).toBe('format');
  });

  it('classifies FAT32 partition without drive letter as assign failure', () => {
    const assessment = assessWindowsFlashPreparationState({
      partitions: [{
        partitionNumber: 1,
        driveLetter: '',
        fileSystem: 'FAT32',
        fileSystemLabel: 'OPENCORE',
        sizeBytes: 15_264_000_000,
      }],
      expectedLabel: 'OPENCORE',
    });
    expect(assessment.status).toBe('failed');
    expect(assessment.stage).toBe('assign');
  });

  it('falls back to the target partition when the label is missing but drive letter exists', () => {
    const assessment = assessWindowsFlashPreparationState({
      partitions: [{
        partitionNumber: 1,
        driveLetter: 'E',
        fileSystem: 'FAT32',
        fileSystemLabel: '',
        sizeBytes: 15_264_000_000,
      }],
      expectedLabel: 'OPENCORE',
    });
    expect(assessment.status).toBe('ready');
    expect(assessment.stage).toBe('label-lookup');
    expect(assessment.driveLetter).toBe('E');
    expect(assessment.usedPartitionFallback).toBe(true);
  });

  it('accepts the expected OPENCORE volume as ready', () => {
    const assessment = assessWindowsFlashPreparationState({
      partitions: [{
        partitionNumber: 1,
        driveLetter: 'F',
        fileSystem: 'FAT32',
        fileSystemLabel: 'OPENCORE',
        sizeBytes: 15_264_000_000,
      }],
      expectedLabel: 'OPENCORE',
    });
    expect(assessment.status).toBe('ready');
    expect(assessment.stage).toBeNull();
    expect(assessment.driveLetter).toBe('F');
  });

  it('targets partition 1 before larger later partitions', () => {
    const assessment = assessWindowsFlashPreparationState({
      partitions: [
        {
          partitionNumber: 2,
          driveLetter: 'G',
          fileSystem: 'FAT32',
          fileSystemLabel: 'OPENCORE',
          sizeBytes: 30_000_000_000,
        },
        {
          partitionNumber: 1,
          driveLetter: '',
          fileSystem: '',
          fileSystemLabel: '',
          sizeBytes: 1_024_000_000,
        },
      ],
      expectedLabel: 'OPENCORE',
    });
    expect(assessment.status).toBe('failed');
    expect(assessment.stage).toBe('format');
    expect(assessment.targetPartitionNumber).toBe(1);
  });
});

describe('buildWindowsBootPartitionDiskpartScript', () => {
  it('explicitly selects partition 1 before formatting BOOTSTRAP', () => {
    const script = buildWindowsBootPartitionDiskpartScript('4');
    expect(script).toContain('select disk 4');
    expect(script).toContain('create partition primary size=16384');
    expect(script).toContain('select partition 1');
    expect(script).toContain('format fs=fat32 quick label=BOOTSTRAP');
    expect(script).toContain('assign');
  });
});

// ─── Linux partition path building ───────────────────────────────────────────

describe('buildLinuxFirstPartitionPath', () => {
  it('appends 1 for sda', () => {
    expect(buildLinuxFirstPartitionPath('/dev/sda')).toBe('/dev/sda1');
  });

  it('appends p1 for nvme', () => {
    expect(buildLinuxFirstPartitionPath('/dev/nvme0n1')).toBe('/dev/nvme0n1p1');
  });

  it('appends p1 for mmcblk', () => {
    expect(buildLinuxFirstPartitionPath('/dev/mmcblk0')).toBe('/dev/mmcblk0p1');
  });
});
