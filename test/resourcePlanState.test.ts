import { describe, it, expect } from 'vitest';
import { buildResourcePlanOwnerKey, resolveVisibleResourcePlan } from '../src/lib/resourcePlanState.js';
import type { HardwareProfile } from '../electron/configGenerator.js';
import type { ResourcePlan } from '../electron/resourcePlanner.js';

function fakeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpu: 'Intel Core i7-10700K',
    architecture: 'Intel',
    generation: 'Comet Lake',
    motherboard: 'ASUS ROG Z490',
    gpu: 'Intel UHD 630',
    ram: '16 GB',
    coreCount: 8,
    targetOS: 'macOS Ventura',
    smbios: 'iMac20,1',
    kexts: ['Lilu', 'WhateverGreen'],
    ssdts: ['SSDT-PLUG'],
    isLaptop: false,
    ...overrides,
  } as HardwareProfile;
}

function fakePlan(count = 2): ResourcePlan {
  return {
    resources: Array.from({ length: count }, (_, i) => ({
      name: `Kext${i}`,
      kind: 'driver' as const,
      source: 'https://example.com',
      expectedIdentityOrVersion: '1.0.0',
      validationOutcome: 'verified' as const,
      sourceClass: 'github' as const,
    })),
  };
}

describe('buildResourcePlanOwnerKey', () => {
  it('returns null for null profile', () => {
    expect(buildResourcePlanOwnerKey(null)).toBeNull();
  });

  it('returns identical key for identical profiles', () => {
    const a = fakeProfile();
    const b = fakeProfile();
    expect(buildResourcePlanOwnerKey(a)).toBe(buildResourcePlanOwnerKey(b));
  });

  it('returns different key when targetOS changes', () => {
    const a = fakeProfile({ targetOS: 'macOS Ventura' });
    const b = fakeProfile({ targetOS: 'macOS Sonoma' });
    expect(buildResourcePlanOwnerKey(a)).not.toBe(buildResourcePlanOwnerKey(b));
  });

  it('returns different key when smbios changes', () => {
    const a = fakeProfile({ smbios: 'iMac20,1' });
    const b = fakeProfile({ smbios: 'MacBookPro16,1' });
    expect(buildResourcePlanOwnerKey(a)).not.toBe(buildResourcePlanOwnerKey(b));
  });

  it('kext order does not affect the key', () => {
    const a = fakeProfile({ kexts: ['Lilu', 'WhateverGreen'] });
    const b = fakeProfile({ kexts: ['WhateverGreen', 'Lilu'] });
    expect(buildResourcePlanOwnerKey(a)).toBe(buildResourcePlanOwnerKey(b));
  });
});

describe('resolveVisibleResourcePlan – non-blank persistence', () => {
  it('returns currentPlan when available', () => {
    const plan = fakePlan();
    expect(resolveVisibleResourcePlan(plan, 'key1', null, null)).toBe(plan);
  });

  it('returns fallback when currentPlan is null and keys match', () => {
    const fallback = fakePlan(3);
    const key = 'same-key';
    expect(resolveVisibleResourcePlan(null, key, fallback, key)).toBe(fallback);
  });

  it('returns null when currentPlan is null and keys differ (profile changed)', () => {
    const fallback = fakePlan();
    expect(resolveVisibleResourcePlan(null, 'new-key', fallback, 'old-key')).toBeNull();
  });

  it('returns null when both plan and fallback are null', () => {
    expect(resolveVisibleResourcePlan(null, 'key', null, 'key')).toBeNull();
  });

  it('returns null when currentOwnerKey is null', () => {
    const fallback = fakePlan();
    expect(resolveVisibleResourcePlan(null, null, fallback, 'key')).toBeNull();
  });

  // Critical scenario: leave Build EFI and re-enter with same profile
  it('simulates leave/re-enter Build EFI — plan persists via fallback', () => {
    const profile = fakeProfile();
    const ownerKey = buildResourcePlanOwnerKey(profile)!;
    const plan = fakePlan(4);

    // Phase 1: plan loaded normally
    const visible1 = resolveVisibleResourcePlan(plan, ownerKey, null, null);
    expect(visible1).toBe(plan);

    // Phase 2: user leaves Build EFI, currentPlan resets to null
    // App stores plan/key as fallback
    const visible2 = resolveVisibleResourcePlan(null, ownerKey, plan, ownerKey);
    expect(visible2).toBe(plan); // NOT null — fallback kicks in

    // Phase 3: user re-enters Build EFI, fresh plan loads
    const freshPlan = fakePlan(5);
    const visible3 = resolveVisibleResourcePlan(freshPlan, ownerKey, plan, ownerKey);
    expect(visible3).toBe(freshPlan);
  });

  // Critical scenario: leave Build EFI, change hardware, re-enter — stale plan must NOT show
  it('simulates profile change — stale fallback is discarded', () => {
    const profile1 = fakeProfile({ targetOS: 'macOS Ventura' });
    const profile2 = fakeProfile({ targetOS: 'macOS Sonoma' });
    const key1 = buildResourcePlanOwnerKey(profile1)!;
    const key2 = buildResourcePlanOwnerKey(profile2)!;
    const stalePlan = fakePlan(2);

    const visible = resolveVisibleResourcePlan(null, key2, stalePlan, key1);
    expect(visible).toBeNull(); // stale plan from different profile must not leak
  });
});
