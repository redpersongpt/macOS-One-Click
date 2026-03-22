import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { HardwareProfile } from '../electron/configGenerator.js';
import type { ResourcePlan } from '../electron/resourcePlanner.js';
import { buildResourcePlanOwnerKey, resolveVisibleResourcePlan } from '../src/lib/resourcePlanState.js';

function makeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpu: 'Intel Core i7-8700K',
    architecture: 'Intel',
    generation: 'Coffee Lake',
    coreCount: 6,
    gpu: 'Intel UHD Graphics 630',
    gpuDevices: [{ name: 'Intel UHD Graphics 630', vendorName: 'Intel' }],
    ram: '16 GB',
    motherboard: 'Z390 AORUS PRO',
    targetOS: 'macOS Sequoia 15',
    smbios: 'iMac19,1',
    kexts: ['Lilu.kext'],
    ssdts: ['SSDT-EC-USBX.aml'],
    bootArgs: '',
    isLaptop: false,
    isVM: false,
    strategy: 'canonical',
    scanConfidence: 'high',
    ...overrides,
  };
}

function makePlan(name: string): ResourcePlan {
  return {
    resources: [{
      name,
      kind: 'kext',
      source: 'https://example.com',
      expectedIdentityOrVersion: '1.0.0',
      validationOutcome: 'verified',
      sourceClass: 'downloaded',
    }],
  };
}

describe('resourcePlanState', () => {
  test('keeps the last valid plan visible for the same planning owner', () => {
    const profile = makeProfile();
    const ownerKey = buildResourcePlanOwnerKey(profile);
    const fallbackPlan = makePlan('Lilu.kext');

    const visible = resolveVisibleResourcePlan(null, ownerKey, fallbackPlan, ownerKey);

    assert.deepEqual(visible, fallbackPlan);
  });

  test('does not reuse a stale plan for a different planning owner', () => {
    const currentOwner = buildResourcePlanOwnerKey(makeProfile());
    const fallbackOwner = buildResourcePlanOwnerKey(makeProfile({ targetOS: 'macOS Sonoma 14' }));
    const visible = resolveVisibleResourcePlan(null, currentOwner, makePlan('Lilu.kext'), fallbackOwner);

    assert.equal(visible, null);
  });
});
