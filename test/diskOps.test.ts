import { describe, it, expect } from 'vitest';
import {
  buildWindowsPhysicalDrivePath,
  isWindowsUsbLikeDisk,
  getWindowsFat32PartitionSizeMB,
  shouldRetryWindowsFlashPreparation,
  buildLinuxFirstPartitionPath,
  buildWindowsFlashDiskpartScript,
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
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: '',
    })).toBe(true);
  });

  it('does NOT retry on last attempt', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 1, maxAttempts: 2, diskpartFailed: true, driveLetter: '',
    })).toBe(false);
  });

  it('does NOT retry when diskpart succeeded', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: false, driveLetter: '',
    })).toBe(false);
  });

  it('does NOT retry when drive letter was assigned', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: 'E',
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
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: '',
    })).toBe(true);
  });

  it('does NOT retry on last attempt even if diskpart failed', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 1, maxAttempts: 2, diskpartFailed: true, driveLetter: '',
    })).toBe(false);
  });

  it('does NOT retry when diskpart succeeded', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: false, driveLetter: '',
    })).toBe(false);
  });

  it('does NOT retry when drive letter was found despite error', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 2, diskpartFailed: true, driveLetter: 'E',
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
      attempt: 0, maxAttempts: 3, diskpartFailed: true, driveLetter: '',
    })).toBe(true);
  });

  it('retries at attempt 1 out of 3', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 1, maxAttempts: 3, diskpartFailed: true, driveLetter: '',
    })).toBe(true);
  });

  it('does NOT retry at attempt 2 out of 3 (last attempt)', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 2, maxAttempts: 3, diskpartFailed: true, driveLetter: '',
    })).toBe(false);
  });

  it('does NOT retry with maxAttempts=1 (single attempt only)', () => {
    expect(shouldRetryWindowsFlashPreparation({
      attempt: 0, maxAttempts: 1, diskpartFailed: true, driveLetter: '',
    })).toBe(false);
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
