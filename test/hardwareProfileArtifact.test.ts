import { describe, it, expect } from 'vitest';
import { normalizeHardwareProfile } from '../electron/hardwareProfileArtifact.js';

// Minimal valid profile used as a base for mutation tests
const validProfile = {
  cpu: 'Intel Core i5-9500',
  architecture: 'Intel',
  generation: 'Coffee Lake',
  gpu: 'Intel UHD Graphics 630',
  ram: '16 GB',
  motherboard: 'ASUS Z390-A',
  targetOS: 'Tahoe 26',
  smbios: 'iMac19,1',
  kexts: ['Lilu.kext', 'VirtualSMC.kext'],
  ssdts: ['SSDT-AWAC.aml'],
  bootArgs: '-v debug=0x100',
};

// ─── architecture validation ─────────────────────────────────────────────────
// Regression for issue #21: user received "profile.architecture is not
// supported: 64-bit" with no guidance on valid values.

describe('normalizeHardwareProfile — architecture', () => {
  it('accepts Intel', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, architecture: 'Intel' })).not.toThrow();
  });

  it('accepts AMD', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, architecture: 'AMD' })).not.toThrow();
  });

  it('accepts Apple Silicon', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, architecture: 'Apple Silicon' })).not.toThrow();
  });

  it('accepts Unknown', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, architecture: 'Unknown' })).not.toThrow();
  });

  it('rejects "64-bit" and lists valid values in the error (issue #21)', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, architecture: '64-bit' }))
      .toThrowError(/Intel.*AMD.*Apple Silicon/);
  });

  it('error message for bad architecture names the rejected value', () => {
    let msg = '';
    try { normalizeHardwareProfile({ ...validProfile, architecture: 'x86_64' }); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('x86_64');
    expect(msg).toContain('Valid values');
  });

  it('rejects an empty architecture string', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, architecture: '' })).toThrow();
  });
});

// ─── generation validation ────────────────────────────────────────────────────

describe('normalizeHardwareProfile — generation', () => {
  it('accepts Coffee Lake', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, generation: 'Coffee Lake' })).not.toThrow();
  });

  it('accepts Ryzen', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, architecture: 'AMD', generation: 'Ryzen' })).not.toThrow();
  });

  it('accepts Unknown', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, generation: 'Unknown' })).not.toThrow();
  });

  it('rejects an unknown generation string and lists valid values', () => {
    let msg = '';
    try { normalizeHardwareProfile({ ...validProfile, generation: 'Meteor Lake' }); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('Meteor Lake');
    expect(msg).toContain('Valid values');
    expect(msg).toContain('Coffee Lake');
  });
});

// ─── strategy validation ──────────────────────────────────────────────────────

describe('normalizeHardwareProfile — strategy', () => {
  it('accepts canonical', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, strategy: 'canonical' })).not.toThrow();
  });

  it('accepts undefined (optional field)', () => {
    const { strategy: _s, ...noStrategy } = validProfile as any;
    expect(() => normalizeHardwareProfile(noStrategy)).not.toThrow();
  });

  it('rejects an unknown strategy and lists valid values', () => {
    let msg = '';
    try { normalizeHardwareProfile({ ...validProfile, strategy: 'experimental' }); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('experimental');
    expect(msg).toContain('canonical');
  });
});

// ─── scanConfidence validation ────────────────────────────────────────────────

describe('normalizeHardwareProfile — scanConfidence', () => {
  it('accepts high', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, scanConfidence: 'high' })).not.toThrow();
  });

  it('accepts undefined (optional field)', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile })).not.toThrow();
  });

  it('rejects an unknown scanConfidence and lists valid values', () => {
    let msg = '';
    try { normalizeHardwareProfile({ ...validProfile, scanConfidence: 'extreme' }); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('extreme');
    expect(msg).toContain('high');
  });
});

// ─── required field validation ────────────────────────────────────────────────

describe('normalizeHardwareProfile — required fields', () => {
  it('rejects a non-object', () => {
    expect(() => normalizeHardwareProfile('not an object')).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() => normalizeHardwareProfile({ ...validProfile, unknownField: 'x' })).toThrow(/unknown field/);
  });

  it('rejects missing cpu', () => {
    const { cpu: _c, ...noCpu } = validProfile as any;
    expect(() => normalizeHardwareProfile(noCpu)).toThrow(/cpu/);
  });
});
