import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildLinuxFirstPartitionPath,
  buildWindowsFlashDiskpartScript,
  buildWindowsPhysicalDrivePath,
  createDiskOps,
  getWindowsFat32PartitionSizeMB,
  isWindowsUsbLikeDisk,
  shouldRetryWindowsFlashPreparation,
} from '../electron/diskOps.js';

// Null logger — we only care about violation output, not log calls
const noop = () => {};

function makeDiskOps() {
  return createDiskOps(noop);
}

function makeTempEfiDir(withPlist: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diskops-test-'));
  const ocDir = path.join(dir, 'EFI', 'OC');
  fs.mkdirSync(ocDir, { recursive: true });
  if (withPlist) {
    fs.writeFileSync(path.join(ocDir, 'config.plist'), '<plist><dict></dict></plist>');
  }
  return dir;
}

describe('diskOps.runSafetyChecks', () => {
  test('DEVICE_NOT_FOUND — non-existent device path is a fatal violation', async () => {
    if (process.platform === 'win32') {
      // Windows uses PhysicalDrive paths — existsSync check differs; skip
      return;
    }
    const diskOps = makeDiskOps();
    const result = await diskOps.runSafetyChecks('/dev/nonexistent_device_oc_test_12345', null);
    const deviceViolation = result.violations.find(v => v.code === 'DEVICE_NOT_FOUND');
    assert.ok(deviceViolation, 'Must produce DEVICE_NOT_FOUND violation for non-existent device');
    assert.equal(deviceViolation!.severity, 'fatal', 'DEVICE_NOT_FOUND must be fatal');
    assert.equal(result.passed, false, 'Result must not pass when there is a fatal violation');
  });

  test('EFI_MISSING_PLIST — temp dir without config.plist produces fatal violation', async () => {
    const efiDir = makeTempEfiDir(false); // no config.plist
    try {
      const diskOps = makeDiskOps();
      // Device path: use /dev/null (exists on macOS/Linux) so DEVICE_NOT_FOUND doesn't fire
      const devicePath = process.platform === 'win32' ? '\\\\.\\PhysicalDrive99' : '/dev/null';
      const result = await diskOps.runSafetyChecks(devicePath, efiDir);
      const plistViolation = result.violations.find(v => v.code === 'EFI_MISSING_PLIST');
      assert.ok(plistViolation, `Must produce EFI_MISSING_PLIST violation. Got: ${JSON.stringify(result.violations.map(v => v.code))}`);
      assert.equal(plistViolation!.severity, 'fatal', 'EFI_MISSING_PLIST must be fatal');
    } finally {
      fs.rmSync(efiDir, { recursive: true, force: true });
    }
  });

  test('Valid EFI with config.plist + non-existent device — both violations present', async () => {
    if (process.platform === 'win32') return;
    const efiDir = makeTempEfiDir(true); // has config.plist
    try {
      const diskOps = makeDiskOps();
      const result = await diskOps.runSafetyChecks('/dev/nonexistent_device_oc_test_99999', efiDir);
      const codes = result.violations.map(v => v.code);
      assert.ok(codes.includes('DEVICE_NOT_FOUND'), `Expected DEVICE_NOT_FOUND in ${JSON.stringify(codes)}`);
      // EFI_MISSING_PLIST should NOT be present because config.plist exists
      assert.ok(!codes.includes('EFI_MISSING_PLIST'), 'EFI_MISSING_PLIST must not appear when config.plist exists');
    } finally {
      fs.rmSync(efiDir, { recursive: true, force: true });
    }
  });

  test('runSafetyChecks returns passed:false when any fatal violation exists', async () => {
    if (process.platform === 'win32') return;
    const diskOps = makeDiskOps();
    const result = await diskOps.runSafetyChecks('/dev/nonexistent_device_oc_fatal_test', null);
    assert.equal(result.passed, false, 'passed must be false when any fatal violation is present');
  });

  test('runSafetyChecks blocks /dev/null because its partition table cannot be identified', async () => {
    if (process.platform === 'win32') return;
    const efiDir = makeTempEfiDir(true);
    try {
      const diskOps = makeDiskOps();
      const result = await diskOps.runSafetyChecks('/dev/null', efiDir);
      const partTableViolation = result.violations.find(v => v.code === 'UNKNOWN_PARTITION_TABLE');
      assert.ok(partTableViolation, `Expected UNKNOWN_PARTITION_TABLE. Got: ${JSON.stringify(result.violations.map(v => v.code))}`);
      assert.equal(partTableViolation!.severity, 'fatal', 'UNKNOWN_PARTITION_TABLE must be fatal for /dev/null');
      assert.equal(result.passed, false, 'passed must be false when the partition table is unknown');
    } finally {
      fs.rmSync(efiDir, { recursive: true, force: true });
    }
  });

  test('A small EFI directory does not trigger EFI_TOO_LARGE', async () => {
    const efiDir = makeTempEfiDir(true); // config.plist only — tiny size
    try {
      const diskOps = makeDiskOps();
      const devicePath = process.platform === 'win32' ? '\\\\.\\PhysicalDrive99' : '/dev/null';
      const result = await diskOps.runSafetyChecks(devicePath, efiDir);
      const tooLarge = result.violations.find(v => v.code === 'EFI_TOO_LARGE');
      assert.ok(!tooLarge, 'A tiny EFI directory (< 480 MB) must not produce EFI_TOO_LARGE');
    } finally {
      fs.rmSync(efiDir, { recursive: true, force: true });
    }
  });

  // SKIP: requires real disk
  // test('SYSTEM_DISK — cannot flash the OS boot disk', async () => { /* requires exec + real disk */ });
  // test('MBR_PARTITION_TABLE — blocked for MBR disks', async () => { /* requires real disk */ });
  // test('PARTITION_IN_USE — warns when partitions are mounted', async () => { /* requires real disk */ });
});

describe('diskOps platform helpers', () => {
  test('buildLinuxFirstPartitionPath handles classic sdX disks', () => {
    assert.equal(buildLinuxFirstPartitionPath('/dev/sdb'), '/dev/sdb1');
  });

  test('buildLinuxFirstPartitionPath handles nvme and mmc devices', () => {
    assert.equal(buildLinuxFirstPartitionPath('/dev/nvme0n1'), '/dev/nvme0n1p1');
    assert.equal(buildLinuxFirstPartitionPath('/dev/mmcblk0'), '/dev/mmcblk0p1');
    assert.equal(buildLinuxFirstPartitionPath('/dev/loop0'), '/dev/loop0p1');
  });

  test('buildWindowsFlashDiskpartScript clears readonly and brings the disk online before cleaning', () => {
    const script = buildWindowsFlashDiskpartScript('2');

    assert.match(script, /select disk 2/);
    assert.match(script, /attributes disk clear readonly noerr/);
    assert.match(script, /offline disk noerr/);
    assert.match(script, /online disk noerr/);
    assert.match(script, /clean noerr/);
    assert.match(script, /convert gpt noerr/);
    assert.match(script, /create partition primary noerr/);
    assert.match(script, /assign noerr/);
    assert.match(script, /rescan/);
  });

  test('buildWindowsFlashDiskpartScript supports an explicit FAT32-safe partition size', () => {
    const script = buildWindowsFlashDiskpartScript('5', 30000);

    assert.match(script, /create partition primary size=30000 noerr/);
    assert.match(script, /format fs=fat32 quick label=OPENCORE noerr/);
  });

  test('getWindowsFat32PartitionSizeMB caps large USB drives to a FAT32-safe size', () => {
    assert.equal(getWindowsFat32PartitionSizeMB(64_000_000_000), 30_000);
    assert.equal(getWindowsFat32PartitionSizeMB(31_000_000_000), undefined);
  });

  test('buildWindowsPhysicalDrivePath normalizes legacy disk aliases', () => {
    assert.equal(buildWindowsPhysicalDrivePath('2'), '\\\\.\\PhysicalDrive2');
    assert.equal(buildWindowsPhysicalDrivePath('disk5'), '\\\\.\\PhysicalDrive5');
    assert.equal(buildWindowsPhysicalDrivePath('\\\\.\\PhysicalDrive7'), '\\\\.\\PhysicalDrive7');
  });

  test('isWindowsUsbLikeDisk recognizes USB bridges beyond BusType USB', () => {
    assert.equal(isWindowsUsbLikeDisk({ busType: 'USB' }), true);
    assert.equal(isWindowsUsbLikeDisk({ busType: 'RAID', interfaceType: 'USB' }), true);
    assert.equal(isWindowsUsbLikeDisk({ pnpDeviceId: 'USBSTOR\\DISK&VEN_GENERIC&PROD_FLASH_DISK' }), true);
    assert.equal(isWindowsUsbLikeDisk({ mediaType: 'Removable Media' }), true);
    assert.equal(isWindowsUsbLikeDisk({ busType: 'SATA', isBoot: false, isSystem: false }), false);
    assert.equal(isWindowsUsbLikeDisk({ busType: 'USB', isSystem: true }), false);
  });

  test('shouldRetryWindowsFlashPreparation only retries the common diskpart lock path once', () => {
    assert.equal(shouldRetryWindowsFlashPreparation({
      attempt: 0,
      maxAttempts: 2,
      diskpartFailed: true,
      driveLetter: '',
    }), true);
    assert.equal(shouldRetryWindowsFlashPreparation({
      attempt: 1,
      maxAttempts: 2,
      diskpartFailed: true,
      driveLetter: '',
    }), false);
    assert.equal(shouldRetryWindowsFlashPreparation({
      attempt: 0,
      maxAttempts: 2,
      diskpartFailed: false,
      driveLetter: '',
    }), false);
    assert.equal(shouldRetryWindowsFlashPreparation({
      attempt: 0,
      maxAttempts: 2,
      diskpartFailed: true,
      driveLetter: 'E',
    }), false);
  });
});
