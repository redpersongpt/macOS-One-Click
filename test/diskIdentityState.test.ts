import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
  pickSelectedDiskInfo,
  shouldRetryDiskInfoLookup,
  toExpectedDiskIdentity,
  type RendererDiskInfo,
} from '../src/lib/diskIdentityState.js';

function makeDiskInfo(overrides: Partial<RendererDiskInfo> = {}): RendererDiskInfo {
  return {
    device: '\\\\.\\PhysicalDrive3',
    devicePath: '\\\\.\\PhysicalDrive3',
    isSystemDisk: false,
    partitionTable: 'gpt',
    sizeBytes: 31_000_000_000,
    model: 'SanDisk Ultra',
    vendor: 'SanDisk',
    serialNumber: 'USB-123',
    transport: 'USB',
    removable: true,
    identityConfidence: 'strong',
    identityFieldsUsed: ['serialNumber', 'devicePath', 'vendor', 'transport', 'partitionTable', 'sizeBytes'],
  };
}

describe('diskIdentityState', () => {
  test('selects the latest valid removable USB identity for flash preparation', () => {
    const latest = makeDiskInfo();

    const picked = pickSelectedDiskInfo(latest.device, latest, null);

    assert.deepEqual(toExpectedDiskIdentity(picked), {
      devicePath: latest.devicePath,
      sizeBytes: latest.sizeBytes,
      model: latest.model,
      vendor: latest.vendor,
      serialNumber: latest.serialNumber,
      transport: latest.transport,
      removable: latest.removable,
      partitionTable: latest.partitionTable,
    });
  });

  test('preserves the captured USB identity when a later lookup is temporarily unavailable', () => {
    const captured = makeDiskInfo();

    const picked = pickSelectedDiskInfo(captured.device, null, captured);

    assert.equal(picked?.serialNumber, 'USB-123');
    assert.equal(picked?.device, captured.device);
  });

  test('retries transient get-disk-info failures instead of hard-failing immediately', () => {
    assert.equal(
      shouldRetryDiskInfoLookup(new Error('Handler get-disk-info timed out'), 0, 2),
      true,
    );
    assert.equal(
      shouldRetryDiskInfoLookup(new Error('Target disk is not found'), 0, 2),
      false,
    );
  });

  test('backup-policy timeout handling does not erase an already captured disk identity', () => {
    const captured = makeDiskInfo();

    const picked = pickSelectedDiskInfo(captured.device, null, captured);

    assert.equal(picked?.identityConfidence, 'strong');
    assert.ok(toExpectedDiskIdentity(picked)?.serialNumber);
  });
});
