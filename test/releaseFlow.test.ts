import { describe, it, expect } from 'vitest';
import { targetSelectionDecision } from '../src/lib/releaseFlow.js';
import type { HardwareProfile } from '../electron/configGenerator.js';

function fakeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpu: 'Intel Core i7-9700K',
    architecture: 'Intel',
    generation: 'Coffee Lake',
    motherboard: 'ASUS Prime Z390-A',
    gpu: 'Intel UHD 630',
    ram: '32 GB',
    coreCount: 8,
    targetOS: 'macOS Sequoia 15',
    smbios: 'iMac19,1',
    kexts: [],
    ssdts: [],
    bootArgs: '',
    isLaptop: false,
    ...overrides,
  } as HardwareProfile;
}

describe('targetSelectionDecision — SMBIOS recomputation (#16)', () => {
  it('recomputes SMBIOS when changing targetOS from Sequoia to Tahoe', () => {
    const profile = fakeProfile({ targetOS: 'macOS Sequoia 15', smbios: 'iMac19,1' });
    const decision = targetSelectionDecision(profile, 'macOS Tahoe 26');
    // Coffee Lake + Tahoe must get iMac20,1, not keep stale iMac19,1
    expect(decision.profile.smbios).toBe('iMac20,1');
    expect(decision.profile.targetOS).toBe('macOS Tahoe 26');
  });

  it('preserves correct SMBIOS when staying on same OS version', () => {
    const profile = fakeProfile({ targetOS: 'macOS Sequoia 15', smbios: 'iMac19,1' });
    const decision = targetSelectionDecision(profile, 'macOS Sequoia 15');
    expect(decision.profile.smbios).toBe('iMac19,1');
  });

  it('recomputes SMBIOS for AMD Ryzen targeting Tahoe', () => {
    const profile = fakeProfile({
      architecture: 'AMD',
      generation: 'Ryzen',
      cpu: 'AMD Ryzen 7 5800X',
      gpu: 'NVIDIA GeForce GTX 1060',
      targetOS: 'macOS Ventura 13',
      smbios: 'iMacPro1,1',
    });
    const decision = targetSelectionDecision(profile, 'macOS Tahoe 26');
    expect(decision.profile.smbios).toBe('iMacPro1,1');
  });
});
