import { describe, it, expect } from 'vitest';
import { validateBuildInputContract } from '../electron/deterministicLayer.js';

describe('validateBuildInputContract', () => {
  it('passes for a complete Intel profile', () => {
    const result = validateBuildInputContract({
      architecture: 'Intel',
      generation: 'Comet Lake',
      targetOS: 'macOS Ventura',
      smbios: 'iMac20,1',
      motherboard: 'ASUS ROG Z490',
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('passes for a complete AMD profile with coreCount', () => {
    const result = validateBuildInputContract({
      architecture: 'AMD',
      generation: 'Ryzen',
      targetOS: 'macOS Ventura',
      smbios: 'iMacPro1,1',
      motherboard: 'MSI B650',
      coreCount: 8,
    });
    expect(result.valid).toBe(true);
  });

  it('fails when architecture is missing', () => {
    const result = validateBuildInputContract({
      generation: 'Comet Lake',
      targetOS: 'macOS Ventura',
      smbios: 'iMac20,1',
      motherboard: 'ASUS ROG Z490',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('architecture is required');
  });

  it('fails when generation is missing', () => {
    const result = validateBuildInputContract({
      architecture: 'Intel',
      targetOS: 'macOS Ventura',
      smbios: 'iMac20,1',
      motherboard: 'ASUS ROG Z490',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('generation is required');
  });

  it('fails when targetOS is missing', () => {
    const result = validateBuildInputContract({
      architecture: 'Intel',
      generation: 'Comet Lake',
      smbios: 'iMac20,1',
      motherboard: 'ASUS ROG Z490',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('targetOS is required');
  });

  it('fails when smbios is missing', () => {
    const result = validateBuildInputContract({
      architecture: 'Intel',
      generation: 'Comet Lake',
      targetOS: 'macOS Ventura',
      motherboard: 'ASUS ROG Z490',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('smbios is required');
  });

  it('fails when motherboard is missing', () => {
    const result = validateBuildInputContract({
      architecture: 'Intel',
      generation: 'Comet Lake',
      targetOS: 'macOS Ventura',
      smbios: 'iMac20,1',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('motherboard is required');
  });

  it('fails for AMD profile without coreCount', () => {
    const result = validateBuildInputContract({
      architecture: 'AMD',
      generation: 'Ryzen',
      targetOS: 'macOS Ventura',
      smbios: 'iMacPro1,1',
      motherboard: 'MSI B650',
      coreCount: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.includes('coreCount'))).toBe(true);
  });

  it('Intel profile does not require coreCount', () => {
    const result = validateBuildInputContract({
      architecture: 'Intel',
      generation: 'Comet Lake',
      targetOS: 'macOS Ventura',
      smbios: 'iMac20,1',
      motherboard: 'ASUS ROG Z490',
    });
    expect(result.valid).toBe(true);
  });

  it('collects all violations at once', () => {
    const result = validateBuildInputContract({});
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(5);
  });
});
