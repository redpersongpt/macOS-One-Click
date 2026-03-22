import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateBuildInputContract, verifyEfiBuildSuccess } from '../electron/deterministicLayer.js';

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

// ── verifyEfiBuildSuccess — ACPI directory and SSDT checks ───────────────────

function makeMinimalEfi(base: string): void {
  // EFI/BOOT/BOOTx64.efi
  const bootDir = path.join(base, 'EFI', 'BOOT');
  fs.mkdirSync(bootDir, { recursive: true });
  fs.writeFileSync(path.join(bootDir, 'BOOTx64.efi'), Buffer.alloc(25 * 1024, 0xaa));
  // EFI/OC/OpenCore.efi
  const ocDir = path.join(base, 'EFI', 'OC');
  fs.mkdirSync(ocDir, { recursive: true });
  fs.writeFileSync(path.join(ocDir, 'OpenCore.efi'), Buffer.alloc(110 * 1024, 0xaa));
  // EFI/OC/config.plist
  fs.writeFileSync(path.join(ocDir, 'config.plist'), `<?xml version="1.0"?><plist version="1.0"><dict></dict></plist>`);
  // EFI/OC/Kexts
  fs.mkdirSync(path.join(ocDir, 'Kexts'), { recursive: true });
  // EFI/OC/ACPI
  fs.mkdirSync(path.join(ocDir, 'ACPI'), { recursive: true });
}

describe('verifyEfiBuildSuccess — ACPI directory and SSDT checks', () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'efi-verify-'));
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) {}
  });

  it('passes when ACPI directory is present', () => {
    makeMinimalEfi(base);
    const result = verifyEfiBuildSuccess(base, []);
    const acpiCheck = result.checks.find(c => c.name === 'ACPI directory');
    expect(acpiCheck).toBeDefined();
    expect(acpiCheck!.passed).toBe(true);
  });

  it('fails when ACPI directory is missing', () => {
    makeMinimalEfi(base);
    fs.rmSync(path.join(base, 'EFI', 'OC', 'ACPI'), { recursive: true, force: true });
    const result = verifyEfiBuildSuccess(base, []);
    const acpiCheck = result.checks.find(c => c.name === 'ACPI directory');
    expect(acpiCheck!.passed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.certainty).toBe('will_fail');
  });

  it('passes SSDT check when all required SSDTs are present', () => {
    makeMinimalEfi(base);
    const acpiDir = path.join(base, 'EFI', 'OC', 'ACPI');
    fs.writeFileSync(path.join(acpiDir, 'SSDT-PLUG.aml'), Buffer.alloc(512, 0));
    fs.writeFileSync(path.join(acpiDir, 'SSDT-EC-USBX.aml'), Buffer.alloc(512, 0));
    const result = verifyEfiBuildSuccess(base, [], ['SSDT-PLUG.aml', 'SSDT-EC-USBX.aml']);
    const ssdtCheck = result.checks.find(c => c.name === 'Required SSDTs');
    expect(ssdtCheck!.passed).toBe(true);
    expect(ssdtCheck!.detail).toContain('2 required SSDTs');
  });

  it('fails SSDT check when a required SSDT is missing', () => {
    makeMinimalEfi(base);
    const acpiDir = path.join(base, 'EFI', 'OC', 'ACPI');
    fs.writeFileSync(path.join(acpiDir, 'SSDT-PLUG.aml'), Buffer.alloc(512, 0));
    // SSDT-EC-USBX.aml intentionally missing
    const result = verifyEfiBuildSuccess(base, [], ['SSDT-PLUG.aml', 'SSDT-EC-USBX.aml']);
    const ssdtCheck = result.checks.find(c => c.name === 'Required SSDTs');
    expect(ssdtCheck!.passed).toBe(false);
    expect(ssdtCheck!.detail).toContain('SSDT-EC-USBX.aml');
    expect(result.passed).toBe(false);
  });

  it('skips SSDT check when no requiredSsdts provided', () => {
    makeMinimalEfi(base);
    const result = verifyEfiBuildSuccess(base, []);
    const ssdtCheck = result.checks.find(c => c.name === 'Required SSDTs');
    expect(ssdtCheck).toBeUndefined();
  });

  it('skips SSDT check when empty requiredSsdts provided', () => {
    makeMinimalEfi(base);
    const result = verifyEfiBuildSuccess(base, [], []);
    const ssdtCheck = result.checks.find(c => c.name === 'Required SSDTs');
    expect(ssdtCheck).toBeUndefined();
  });

  it('SSDT check fails gracefully when ACPI directory is missing', () => {
    makeMinimalEfi(base);
    fs.rmSync(path.join(base, 'EFI', 'OC', 'ACPI'), { recursive: true, force: true });
    const result = verifyEfiBuildSuccess(base, [], ['SSDT-PLUG.aml']);
    const ssdtCheck = result.checks.find(c => c.name === 'Required SSDTs');
    expect(ssdtCheck!.passed).toBe(false);
    expect(ssdtCheck!.detail).toContain('SSDT-PLUG.aml');
  });
});
