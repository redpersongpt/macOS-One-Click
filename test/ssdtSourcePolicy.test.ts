import { describe, expect, it } from 'vitest';
import {
  getSsdtSourcePolicy,
  getUnsupportedSsdtRequests,
  OPENCORE_PKG_ACPI_SAMPLE_FILES,
  DORTANIA_COMPILED_ACPI_FILES,
} from '../electron/ssdtSourcePolicy.js';

// ── OpenCorePkg-native SSDTs (bundled, no supplemental download) ─────────────

describe('getSsdtSourcePolicy — OpenCorePkg-native SSDTs', () => {
  const openCorePkgSsdts = [
    'SSDT-PLUG.aml',
    'SSDT-PLUG-ALT.aml',
    'SSDT-EC.aml',
    'SSDT-EC-USBX.aml',
    'SSDT-PNLF.aml',
    'SSDT-PMC.aml',
    'SSDT-AWAC-DISABLE.aml',
    'SSDT-IMEI.aml',
    'SSDT-RTC0.aml',
    'SSDT-RTC0-RANGE.aml',
    'SSDT-SBUS-MCHC.aml',
    'SSDT-BRG0.aml',
    'SSDT-ALS0.aml',
    'SSDT-UNC.aml',
    'SSDT-EHCx-DISABLE.aml',
  ];

  for (const ssdt of openCorePkgSsdts) {
    it(`${ssdt} resolves with no supplemental download`, () => {
      const policy = getSsdtSourcePolicy(ssdt);
      expect(policy, `policy for ${ssdt} should not be null`).not.toBeNull();
      expect(policy!.packageCandidates).toContain(ssdt);
      expect(policy!.supplementalDownload).toBeUndefined();
      expect(policy!.requestedFileName).toBe(ssdt);
    });
  }

  it('SSDT-PLUG-ALT.aml is for Alder/Raptor Lake — package-only', () => {
    const policy = getSsdtSourcePolicy('SSDT-PLUG-ALT.aml');
    expect(policy!.packageCandidates).toEqual(['SSDT-PLUG-ALT.aml']);
    expect(policy!.supplementalDownload).toBeUndefined();
  });

  it('SSDT-PMC.aml is for Z390/Z370 — package-only', () => {
    const policy = getSsdtSourcePolicy('SSDT-PMC.aml');
    expect(policy!.packageCandidates).toEqual(['SSDT-PMC.aml']);
    expect(policy!.supplementalDownload).toBeUndefined();
  });

  it('SSDT-EC.aml (legacy EC for Sandy Bridge/Ivy Bridge) — package-only', () => {
    const policy = getSsdtSourcePolicy('SSDT-EC.aml');
    expect(policy!.packageCandidates).toEqual(['SSDT-EC.aml']);
    expect(policy!.supplementalDownload).toBeUndefined();
  });

  it('SSDT-EC-USBX.aml (Skylake/Kaby Lake desktop) — package-only', () => {
    const policy = getSsdtSourcePolicy('SSDT-EC-USBX.aml');
    expect(policy!.packageCandidates).toEqual(['SSDT-EC-USBX.aml']);
    expect(policy!.supplementalDownload).toBeUndefined();
  });

  it('SSDT-PNLF.aml (laptop display backlight) — package-only', () => {
    const policy = getSsdtSourcePolicy('SSDT-PNLF.aml');
    expect(policy!.packageCandidates).toContain('SSDT-PNLF.aml');
    expect(policy!.supplementalDownload).toBeUndefined();
  });
});

// ── Dortania-sourced SSDTs (require supplemental download) ───────────────────

describe('getSsdtSourcePolicy — Dortania supplemental SSDTs', () => {
  const dortaniaSsdts = [
    'SSDT-CPUR.aml',
    'SSDT-EC-DESKTOP.aml',
    'SSDT-EC-LAPTOP.aml',
    'SSDT-EC-USBX-DESKTOP.aml',
    'SSDT-EC-USBX-LAPTOP.aml',
    'SSDT-XOSI.aml',
    'SSDT-RHUB.aml',
    'SSDT-PLUG-DRTNIA.aml',
    'SSDT-IMEI-S.aml',
    'SSDT-RTC0-RANGE-HEDT.aml',
  ];

  for (const ssdt of dortaniaSsdts) {
    it(`${ssdt} resolves with Dortania supplemental download`, () => {
      const policy = getSsdtSourcePolicy(ssdt);
      expect(policy, `policy for ${ssdt} should not be null`).not.toBeNull();
      expect(policy!.supplementalDownload).toBeDefined();
      expect(policy!.supplementalDownload!.catalog).toBe('dortania');
      expect(policy!.supplementalDownload!.url).toMatch(/^https:\/\//);
      expect(policy!.supplementalDownload!.url).toContain(ssdt);
      expect(policy!.requestedFileName).toBe(ssdt);
    });
  }

  it('SSDT-AWAC.aml offers both OpenCore AWAC-DISABLE alias and Dortania download', () => {
    const policy = getSsdtSourcePolicy('SSDT-AWAC.aml');
    expect(policy).not.toBeNull();
    expect(policy!.packageCandidates).toEqual(['SSDT-AWAC.aml', 'SSDT-AWAC-DISABLE.aml']);
    expect(policy!.supplementalDownload?.url).toContain('/SSDT-AWAC.aml');
    expect(policy!.supplementalDownload?.catalog).toBe('dortania');
  });

  it('SSDT-CPUR.aml (AMD B550/X570 CPUID fix) — Dortania only, no alias', () => {
    const policy = getSsdtSourcePolicy('SSDT-CPUR.aml');
    expect(policy!.packageCandidates).toEqual(['SSDT-CPUR.aml']);
    expect(policy!.supplementalDownload?.url).toContain('/SSDT-CPUR.aml');
  });

  it('SSDT-EC-USBX-DESKTOP.aml (AMD desktop) — Dortania only', () => {
    const policy = getSsdtSourcePolicy('SSDT-EC-USBX-DESKTOP.aml');
    expect(policy!.packageCandidates).toEqual(['SSDT-EC-USBX-DESKTOP.aml']);
    expect(policy!.supplementalDownload?.url).toContain('/SSDT-EC-USBX-DESKTOP.aml');
  });

  it('SSDT-XOSI.aml (laptop ACPI OS selection) — Dortania only', () => {
    const policy = getSsdtSourcePolicy('SSDT-XOSI.aml');
    expect(policy!.packageCandidates).toEqual(['SSDT-XOSI.aml']);
    expect(policy!.supplementalDownload?.url).toContain('/SSDT-XOSI.aml');
  });
});

// ── Unsupported / unknown SSDTs ──────────────────────────────────────────────

describe('getSsdtSourcePolicy — unsupported SSDT detection', () => {
  it('returns null for completely unknown SSDTs', () => {
    expect(getSsdtSourcePolicy('SSDT-NOT-REAL.aml')).toBeNull();
    expect(getSsdtSourcePolicy('SSDT-CUSTOM.aml')).toBeNull();
    expect(getSsdtSourcePolicy('')).toBeNull();
  });

  it('getUnsupportedSsdtRequests filters and deduplicates', () => {
    const unsupported = getUnsupportedSsdtRequests([
      'SSDT-PMC.aml',
      'SSDT-NOT-REAL.aml',
      'SSDT-NOT-REAL.aml',
      'SSDT-CPUR.aml',
      'SSDT-FAKE.aml',
    ]);
    expect(unsupported).toEqual(['SSDT-FAKE.aml', 'SSDT-NOT-REAL.aml']);
  });

  it('getUnsupportedSsdtRequests returns empty for all-valid input', () => {
    expect(getUnsupportedSsdtRequests(['SSDT-PLUG.aml', 'SSDT-EC.aml', 'SSDT-AWAC.aml'])).toEqual([]);
  });

  it('SSDT names are case-sensitive', () => {
    expect(getSsdtSourcePolicy('ssdt-plug.aml')).toBeNull();
    expect(getSsdtSourcePolicy('SSDT-PLUG.AML')).toBeNull();
    expect(getSsdtSourcePolicy('SSDT-PLUG.aml')).not.toBeNull();
  });
});

// ── Invariants across all known SSDTs ────────────────────────────────────────

describe('getSsdtSourcePolicy — structural invariants', () => {
  it('every SSDT in OPENCORE_PKG set resolves to a non-null policy', () => {
    for (const ssdt of OPENCORE_PKG_ACPI_SAMPLE_FILES) {
      const policy = getSsdtSourcePolicy(ssdt);
      expect(policy, `null policy for ${ssdt}`).not.toBeNull();
      expect(policy!.packageCandidates.length, `${ssdt} needs at least one candidate`).toBeGreaterThan(0);
      expect(policy!.requestedFileName).toBe(ssdt);
    }
  });

  it('Dortania-only SSDTs (not in OpenCorePkg set) always have supplemental download', () => {
    // SSDTs in both sets resolve from OpenCorePkg first (no supplemental) — that is correct.
    // Only SSDTs exclusively in the Dortania set should always carry supplementalDownload.
    for (const ssdt of DORTANIA_COMPILED_ACPI_FILES) {
      if (OPENCORE_PKG_ACPI_SAMPLE_FILES.has(ssdt)) continue; // overlap SSDTs handled separately
      const policy = getSsdtSourcePolicy(ssdt);
      expect(policy, `null policy for ${ssdt}`).not.toBeNull();
      expect(
        policy!.supplementalDownload,
        `${ssdt} (Dortania-only) should have supplemental download`,
      ).toBeDefined();
      expect(policy!.supplementalDownload!.catalog).toBe('dortania');
    }
  });

  it('SSDTs in both sets resolve from OpenCorePkg (no supplemental)', () => {
    // These SSDTs are in both sets; resolution order gives OpenCore priority, no download needed.
    // (SSDT-PMC, SSDT-PNLF, SSDT-IMEI, SSDT-UNC are in both sets.)
    const overlapping = [...DORTANIA_COMPILED_ACPI_FILES].filter(s => OPENCORE_PKG_ACPI_SAMPLE_FILES.has(s));
    expect(overlapping.length).toBeGreaterThan(0); // sanity check
    for (const ssdt of overlapping) {
      const policy = getSsdtSourcePolicy(ssdt);
      expect(policy, `null policy for ${ssdt}`).not.toBeNull();
      expect(policy!.supplementalDownload, `${ssdt} overlap resolves from OpenCorePkg — no supplemental expected`).toBeUndefined();
    }
  });

  it('every known SSDT policy has a valid requestedFileName matching the input', () => {
    const allSsdts = [...OPENCORE_PKG_ACPI_SAMPLE_FILES, ...DORTANIA_COMPILED_ACPI_FILES];
    for (const ssdt of allSsdts) {
      const policy = getSsdtSourcePolicy(ssdt);
      if (policy) {
        expect(policy.requestedFileName).toBe(ssdt);
      }
    }
  });
});
