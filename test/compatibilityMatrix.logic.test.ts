import { describe, it, expect } from 'vitest';
import { buildCompatibilityMatrix } from '../electron/compatibilityMatrix.js';
import type { HardwareProfile } from '../electron/configGenerator.js';

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
    kexts: [],
    ssdts: [],
    bootArgs: '',
    isLaptop: false,
    ...overrides,
  } as HardwareProfile;
}

describe('buildCompatibilityMatrix — behavioral tests', () => {
  it('returns non-empty rows for standard Intel hardware', () => {
    const matrix = buildCompatibilityMatrix(fakeProfile());
    expect(matrix.rows.length).toBeGreaterThan(0);
  });

  it('recommendedVersion is never empty', () => {
    const matrix = buildCompatibilityMatrix(fakeProfile());
    expect(matrix.recommendedVersion).toBeTruthy();
    expect(matrix.recommendedVersion.length).toBeGreaterThan(0);
  });

  it('exactly one row is marked recommended', () => {
    const matrix = buildCompatibilityMatrix(fakeProfile());
    const recommendedCount = matrix.rows.filter(r => r.recommended).length;
    expect(recommendedCount).toBe(1);
  });

  it('recommended row matches recommendedVersion', () => {
    const matrix = buildCompatibilityMatrix(fakeProfile());
    const recRow = matrix.rows.find(r => r.recommended);
    expect(recRow?.versionName).toBe(matrix.recommendedVersion);
  });

  it('every row has valid status', () => {
    const validStatuses = ['supported', 'experimental', 'risky', 'blocked'];
    const matrix = buildCompatibilityMatrix(fakeProfile());
    for (const row of matrix.rows) {
      expect(validStatuses).toContain(row.status);
    }
  });

  it('AMD Ryzen produces a valid matrix', () => {
    const matrix = buildCompatibilityMatrix(fakeProfile({
      architecture: 'AMD',
      generation: 'Ryzen',
      cpu: 'AMD Ryzen 7 5800X',
      gpu: 'AMD Radeon RX 580',
    }));
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(matrix.recommendedVersion).toBeTruthy();
  });

  it('laptop profile produces a valid matrix', () => {
    const matrix = buildCompatibilityMatrix(fakeProfile({
      isLaptop: true,
      generation: 'Coffee Lake',
    }));
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(matrix.recommendedVersion).toBeTruthy();
  });
});
