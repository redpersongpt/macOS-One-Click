import { describe, it, expect } from 'vitest';
import {
  canProceedWithFlash,
  compareDiskIdentity,
  buildDiskIdentityFingerprint,
  resolveFlashPreparationIdentity,
  FLASH_CONFIRMATION_TTL_MS,
} from '../electron/flashSafety.js';
import type { FlashSafetyContext, DiskIdentityFingerprint } from '../electron/flashSafety.js';
import type { DiskInfo } from '../electron/diskOps.js';

function fakeDisk(overrides: Partial<DiskInfo> = {}): DiskInfo {
  return {
    device: '\\\\.\\PhysicalDrive2',
    devicePath: '\\\\.\\PhysicalDrive2',
    isSystemDisk: false,
    partitionTable: 'gpt',
    mountedPartitions: [],
    sizeBytes: 16_000_000_000,
    model: 'Kingston DataTraveler',
    vendor: 'Kingston',
    serialNumber: 'KINGSTONUSB123',
    transport: 'USB',
    removable: true,
    identityConfidence: 'strong',
    ...overrides,
  } as DiskInfo;
}

function safeContext(overrides: Partial<FlashSafetyContext> = {}): FlashSafetyContext {
  const disk = fakeDisk();
  return {
    selectedDevice: disk.device,
    currentDisk: disk,
    explicitUserConfirmation: true,
    confirmationValidated: { valid: true, reason: null, code: null },
    expectedIdentity: buildDiskIdentityFingerprint(disk),
    collisionDevices: [],
    biosReady: true,
    efiValidationClean: true,
    deployGuardAllowed: true,
    deployGuardReason: null,
    ...overrides,
  };
}

// ─── Flash safety gate ───────────────────────────────────────────────────────

describe('canProceedWithFlash — safety invariants', () => {
  it('allows flash when all conditions are met', () => {
    expect(canProceedWithFlash(safeContext()).allowed).toBe(true);
  });

  it('blocks when no device selected', () => {
    const r = canProceedWithFlash(safeContext({ selectedDevice: '' }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('NO_DEVICE_SELECTED');
  });

  it('blocks when target disk disappeared', () => {
    const r = canProceedWithFlash(safeContext({ currentDisk: null as any }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('TARGET_DISAPPEARED');
  });

  it('blocks without explicit user confirmation', () => {
    const r = canProceedWithFlash(safeContext({ explicitUserConfirmation: false }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('blocks system disk — ABSOLUTE invariant', () => {
    const r = canProceedWithFlash(safeContext({
      currentDisk: fakeDisk({ isSystemDisk: true }),
    }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('SYSTEM_DISK');
  });

  it('blocks MBR partition table', () => {
    const r = canProceedWithFlash(safeContext({
      currentDisk: fakeDisk({ partitionTable: 'mbr' }),
    }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('UNSAFE_PARTITION_TABLE');
    expect(r.reason).toContain('MBR');
  });

  it('blocks unknown partition table (distinct from system disk)', () => {
    const r = canProceedWithFlash(safeContext({
      currentDisk: fakeDisk({ partitionTable: 'unknown' }),
    }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('UNSAFE_PARTITION_TABLE');
    expect(r.reason).toContain('unreadable');
  });

  it('blocks weak identity confidence', () => {
    const r = canProceedWithFlash(safeContext({
      currentDisk: fakeDisk({ identityConfidence: 'weak' }),
    }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('IDENTITY_WEAK');
  });

  it('blocks ambiguous identity confidence', () => {
    const r = canProceedWithFlash(safeContext({
      currentDisk: fakeDisk({ identityConfidence: 'ambiguous' }),
    }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('IDENTITY_WEAK');
  });

  it('blocks identity change since selection', () => {
    const disk = fakeDisk({ serialNumber: 'DIFFERENT_SERIAL' });
    const r = canProceedWithFlash(safeContext({
      currentDisk: disk,
      expectedIdentity: buildDiskIdentityFingerprint(fakeDisk({ serialNumber: 'ORIGINAL_SERIAL' })),
    }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('IDENTITY_CHANGED');
  });

  it('blocks identity collision with other devices', () => {
    const r = canProceedWithFlash(safeContext({
      collisionDevices: ['\\\\.\\PhysicalDrive3'],
    }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('IDENTITY_COLLISION');
  });

  it('blocks when BIOS not ready', () => {
    const r = canProceedWithFlash(safeContext({ biosReady: false }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('BIOS_NOT_READY');
  });

  it('blocks when EFI validation is not clean', () => {
    const r = canProceedWithFlash(safeContext({ efiValidationClean: false }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('EFI_INVALID');
  });

  it('blocks when deploy guard fails', () => {
    const r = canProceedWithFlash(safeContext({ deployGuardAllowed: false }));
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('DEPLOY_GUARD_FAILED');
  });

  // Invariant: partition-table errors are distinct from system-disk errors
  it('partition-table error code differs from system-disk error code', () => {
    const ptError = canProceedWithFlash(safeContext({
      currentDisk: fakeDisk({ partitionTable: 'unknown' }),
    }));
    const sysError = canProceedWithFlash(safeContext({
      currentDisk: fakeDisk({ isSystemDisk: true }),
    }));
    expect(ptError.code).not.toBe(sysError.code);
    expect(ptError.code).toBe('UNSAFE_PARTITION_TABLE');
    expect(sysError.code).toBe('SYSTEM_DISK');
  });
});

// ─── Token TTL ───────────────────────────────────────────────────────────────

describe('flash confirmation token TTL', () => {
  it('TTL is exactly 5 minutes', () => {
    expect(FLASH_CONFIRMATION_TTL_MS).toBe(300_000);
  });
});

// ─── Disk identity ───────────────────────────────────────────────────────────

describe('compareDiskIdentity', () => {
  it('matches identical fingerprints', () => {
    const fp = buildDiskIdentityFingerprint(fakeDisk());
    const result = compareDiskIdentity(fp, fakeDisk());
    expect(result.ok).toBe(true);
  });

  it('detects serial number change', () => {
    const fp = buildDiskIdentityFingerprint(fakeDisk({ serialNumber: 'AAA' }));
    const result = compareDiskIdentity(fp, fakeDisk({ serialNumber: 'BBB' }));
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContain('serialNumber mismatch');
  });
});

describe('resolveFlashPreparationIdentity', () => {
  it('uses expected identity when provided', () => {
    const expected: Partial<DiskInfo> = { serialNumber: 'EXPECTED', vendor: 'Kingston' };
    const current = fakeDisk({ serialNumber: 'CURRENT' });
    const result = resolveFlashPreparationIdentity(expected, current);
    expect(result?.serialNumber).toBe('expected');
  });

  it('falls back to current disk when no expected identity', () => {
    const current = fakeDisk({ serialNumber: 'FALLBACK' });
    const result = resolveFlashPreparationIdentity(null, current);
    expect(result?.serialNumber).toBe('fallback');
  });
});
