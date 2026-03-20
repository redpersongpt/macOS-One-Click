import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import type { HardwareProfile } from '../electron/configGenerator.js';
import { getCommunityEvidenceSummary } from '../electron/communityEvidence.js';

function makeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpu: 'Intel Core i5-4300M',
    architecture: 'Intel',
    generation: 'Haswell',
    coreCount: 2,
    gpu: 'Intel HD Graphics 4600',
    gpuDevices: [{ name: 'Intel HD Graphics 4600', vendorName: 'Intel' }],
    ram: '8 GB',
    motherboard: 'ThinkPad T440p',
    targetOS: 'macOS Big Sur 11',
    smbios: 'MacBookPro11,1',
    kexts: [],
    ssdts: [],
    bootArgs: '-v',
    isLaptop: true,
    isVM: false,
    audioLayoutId: 1,
    strategy: 'canonical',
    scanConfidence: 'high',
    ...overrides,
  };
}

describe('community evidence summary', () => {
  test('matches documented ThinkPad-class laptop success posts conservatively', () => {
    const summary = getCommunityEvidenceSummary(makeProfile());

    assert.notEqual(summary.signal, 'none');
    assert.equal(summary.matchLevel, 'strong');
    assert.ok(summary.matchedCount >= 2);
    assert.equal(summary.highestReportedVersion, 'macOS Big Sur 11');
    assert.ok(summary.whatUsuallyWorks.some((item) => /boot|gpu/i.test(item)));
    assert.ok(summary.whatDidNotWork.some((item) => /trackpad|quirk/i.test(item)));
    assert.match(summary.matchExplanation ?? '', /strong match/i);
  });

  test('returns no advisory signal for unrelated modern hardware', () => {
    const summary = getCommunityEvidenceSummary(makeProfile({
      cpu: 'AMD Ryzen 7 7700X',
      architecture: 'AMD',
      generation: 'Ryzen',
      gpu: 'AMD Radeon RX 7900 XT',
      gpuDevices: [{ name: 'AMD Radeon RX 7900 XT', vendorName: 'AMD' }],
      motherboard: 'ASUS X670E',
      isLaptop: false,
      smbios: 'MacPro7,1',
    }));

    assert.equal(summary.signal, 'none');
    assert.equal(summary.matchLevel, 'none');
    assert.equal(summary.matchedCount, 0);
    assert.equal(summary.highestReportedVersion, null);
  });
});
