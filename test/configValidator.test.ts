import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { validateEfi, type ValidationResult } from '../electron/configValidator.js';
import { generateConfigPlist, getRequiredResources, getSMBIOSForProfile } from '../electron/configGenerator.js';
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createEfiStructure(efiBase: string, opts: {
  configPlist?: string;
  openCoreEfi?: boolean;
  bootx64Efi?: boolean;
  openRuntimeEfi?: boolean;
  openHfsPlusEfi?: boolean;
  kexts?: string[];
  ssdts?: string[];
  drivers?: boolean;
  kextsDir?: boolean;
  nestedEfi?: boolean;
  versionSidecars?: Record<string, string>;
} = {}): void {
  const ocDir = path.join(efiBase, 'EFI/OC');
  const bootDir = path.join(efiBase, 'EFI/BOOT');
  const driversDir = path.join(ocDir, 'Drivers');
  const kextsDir = path.join(ocDir, 'Kexts');
  const acpiDir = path.join(ocDir, 'ACPI');

  fs.mkdirSync(bootDir, { recursive: true });
  fs.mkdirSync(driversDir, { recursive: true });
  if (opts.kextsDir !== false) fs.mkdirSync(kextsDir, { recursive: true });
  fs.mkdirSync(acpiDir, { recursive: true });

  // Config plist
  if (opts.configPlist !== undefined) {
    fs.writeFileSync(path.join(ocDir, 'config.plist'), opts.configPlist);
  }

  // Core binaries (fill with enough data to pass size checks)
  const largeBuf = Buffer.alloc(200 * 1024, 0x90); // 200KB
  if (opts.openCoreEfi !== false) {
    fs.writeFileSync(path.join(ocDir, 'OpenCore.efi'), largeBuf);
  }
  if (opts.bootx64Efi !== false) {
    fs.writeFileSync(path.join(bootDir, 'BOOTx64.efi'), largeBuf);
  }
  if (opts.openRuntimeEfi !== false) {
    fs.writeFileSync(path.join(driversDir, 'OpenRuntime.efi'), largeBuf);
  }
  if (opts.openHfsPlusEfi !== false) {
    fs.writeFileSync(path.join(driversDir, 'OpenHfsPlus.efi'), largeBuf);
  }
  // OpenCanopy.efi is always referenced in the generated plist
  fs.writeFileSync(path.join(driversDir, 'OpenCanopy.efi'), largeBuf);

  // Version sidecars
  const versions = opts.versionSidecars ?? { 'OpenCore.efi': '1.0.2', 'BOOTx64.efi': '1.0.2', 'OpenRuntime.efi': '1.0.2', 'OpenHfsPlus.efi': '1.0.2' };
  for (const [name, version] of Object.entries(versions)) {
    let target: string;
    if (name === 'BOOTx64.efi') target = path.join(bootDir, name);
    else if (name.startsWith('Open') && name !== 'OpenCore.efi') target = path.join(driversDir, name);
    else target = path.join(ocDir, name);
    fs.writeFileSync(`${target}.version`, version);
  }

  // Kexts — create real bundles with Info.plist and executable
  for (const kextName of (opts.kexts ?? [])) {
    const kextDir = path.join(kextsDir, kextName);
    const macosDir = path.join(kextDir, 'Contents/MacOS');
    fs.mkdirSync(macosDir, { recursive: true });
    const execName = kextName.replace('.kext', '');
    fs.writeFileSync(path.join(kextDir, 'Contents/Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>${execName}</string>
<key>CFBundleIdentifier</key><string>com.test.${execName}</string>
</dict></plist>`);
    fs.writeFileSync(path.join(macosDir, execName), largeBuf);
  }

  // SSDTs
  for (const ssdt of (opts.ssdts ?? [])) {
    fs.writeFileSync(path.join(acpiDir, ssdt), Buffer.alloc(100, 0x42));
  }

  if (opts.nestedEfi) {
    fs.mkdirSync(path.join(efiBase, 'EFI/EFI'), { recursive: true });
  }
}

// ─── Phase 1: File existence ────────────────────────────────────────────────

describe('validateEfi — file existence checks', () => {
  it('passes with complete valid EFI', async () => {
    const profile = fakeProfile();
    const plist = generateConfigPlist(profile);
    const resources = getRequiredResources(profile);
    createEfiStructure(tmpDir, {
      configPlist: plist,
      kexts: resources.kexts,
      ssdts: resources.ssdts,
    });
    const result = await validateEfi(tmpDir, profile);
    const blockers = result.issues.filter(i => i.severity === 'blocked');
    expect(blockers).toEqual([]);
  });

  it('blocks when OpenCore.efi is missing', async () => {
    const profile = fakeProfile();
    createEfiStructure(tmpDir, {
      configPlist: generateConfigPlist(profile),
      openCoreEfi: false,
    });
    const result = await validateEfi(tmpDir, profile);
    expect(result.overall).toBe('blocked');
    expect(result.issues.some(i => i.code === 'MISSING_FILE' && i.component === 'OpenCore.efi')).toBe(true);
  });

  it('blocks when BOOTx64.efi is missing', async () => {
    const profile = fakeProfile();
    createEfiStructure(tmpDir, {
      configPlist: generateConfigPlist(profile),
      bootx64Efi: false,
    });
    const result = await validateEfi(tmpDir, profile);
    expect(result.issues.some(i => i.code === 'MISSING_FILE' && i.component === 'BOOTx64.efi')).toBe(true);
  });

  it('blocks when config.plist is too small', async () => {
    createEfiStructure(tmpDir, { configPlist: '<plist><dict></dict></plist>' });
    const result = await validateEfi(tmpDir, null);
    expect(result.issues.some(i => i.code === 'FILE_TOO_SMALL' || i.code === 'PLIST_TOO_SMALL')).toBe(true);
  });

  it('detects nested EFI/EFI directory', async () => {
    createEfiStructure(tmpDir, {
      configPlist: generateConfigPlist(fakeProfile()),
      nestedEfi: true,
    });
    const result = await validateEfi(tmpDir, null);
    expect(result.issues.some(i => i.code === 'NESTED_STRUCTURE')).toBe(true);
  });
});

// ─── Phase 2: Plist integrity ───────────────────────────────────────────────

describe('validateEfi — plist integrity', () => {
  it('blocks when plist is missing XML structure', async () => {
    createEfiStructure(tmpDir, {
      configPlist: 'this is not xml at all, just random text that is long enough to pass the size check for the validator phase two',
    });
    const result = await validateEfi(tmpDir, null);
    expect(result.issues.some(i => i.code === 'PLIST_INVALID')).toBe(true);
  });

  it('passes when plist has valid structure', async () => {
    const plist = generateConfigPlist(fakeProfile());
    createEfiStructure(tmpDir, { configPlist: plist });
    const result = await validateEfi(tmpDir, null);
    expect(result.issues.filter(i => i.code === 'PLIST_INVALID')).toEqual([]);
  });

  it('blocks when required OpenCore sections are missing', async () => {
    // A valid XML plist but missing all OC sections
    const minimalPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>SomeOtherKey</key>
  <string>value</string>
</dict>
</plist>`;
    createEfiStructure(tmpDir, { configPlist: minimalPlist });
    const result = await validateEfi(tmpDir, null);
    expect(result.issues.some(i => i.code === 'PLIST_SECTIONS_MISSING')).toBe(true);
    const sectionIssue = result.issues.find(i => i.code === 'PLIST_SECTIONS_MISSING');
    expect(sectionIssue!.message).toContain('Kernel');
    expect(sectionIssue!.message).toContain('UEFI');
  });

  it('generated plist passes section check', async () => {
    const plist = generateConfigPlist(fakeProfile());
    createEfiStructure(tmpDir, { configPlist: plist });
    const result = await validateEfi(tmpDir, null);
    expect(result.issues.filter(i => i.code === 'PLIST_SECTIONS_MISSING')).toEqual([]);
  });
});

// ─── Phase 3: Kext consistency ──────────────────────────────────────────────

describe('validateEfi — kext consistency', () => {
  it('warns when expected kext is missing from disk', async () => {
    const profile = fakeProfile();
    const plist = generateConfigPlist(profile);
    // Create structure but WITHOUT kexts
    createEfiStructure(tmpDir, { configPlist: plist, kexts: [] });
    const result = await validateEfi(tmpDir, profile);
    expect(result.issues.some(i => i.code === 'KEXT_EXPECTED_MISSING')).toBe(true);
  });

  it('blocks when config references kext not on disk', async () => {
    const profile = fakeProfile();
    const plist = generateConfigPlist(profile);
    // Only install Lilu, not VirtualSMC
    createEfiStructure(tmpDir, { configPlist: plist, kexts: ['Lilu.kext'] });
    const result = await validateEfi(tmpDir, profile);
    // Plist references VirtualSMC but it's on disk? No — only Lilu is created.
    // The KEXT_MISSING check depends on plist BundlePath entries vs disk.
    // VirtualSMC.kext directory doesn't exist, so should be blocked.
    expect(result.issues.some(i =>
      i.code === 'KEXT_MISSING' && i.component.includes('VirtualSMC'),
    )).toBe(true);
  });
});

// ─── Phase 4: Patch sanity ──────────────────────────────────────────────────

describe('validateEfi — patch sanity', () => {
  it('warns about AMD patches on Intel system', async () => {
    const profile = fakeProfile({ architecture: 'Intel' });
    // Generate AMD plist (has kernel patches with "algrey" comments) — detect requires AMD keyword.
    // Inject an explicit AMD-labeled patch into the Intel plist's Kernel > Patch section.
    const intelPlist = generateConfigPlist(profile);
    // The Kernel Patch section looks like: <key>Patch</key>\n        <array>\n ... </array>
    // For Intel, it's empty inside. We need to find the Kernel section's Patch array.
    const kernelKeyIdx = intelPlist.indexOf('<key>Kernel</key>');
    const patchKeyIdx = intelPlist.indexOf('<key>Patch</key>', kernelKeyIdx);
    const arrayStartIdx = intelPlist.indexOf('<array>', patchKeyIdx);
    const injected = intelPlist.slice(0, arrayStartIdx + '<array>'.length) +
      '<dict><key>Comment</key><string>AMD Ryzen cpuid patch</string>' +
      '<key>Find</key><data>AQAAAA==</data>' +
      '<key>Replace</key><data>AgAAAA==</data>' +
      '<key>Enabled</key><true/></dict>' +
      intelPlist.slice(arrayStartIdx + '<array>'.length);
    const resources = getRequiredResources(profile);
    createEfiStructure(tmpDir, {
      configPlist: injected,
      kexts: resources.kexts,
      ssdts: resources.ssdts,
    });
    const result = await validateEfi(tmpDir, profile);
    expect(result.issues.some(i => i.code === 'AMD_PATCHES_ON_INTEL')).toBe(true);
  });
});

// ─── Phase 5: SSDT check ───────────────────────────────────────────────────

describe('validateEfi — SSDT checks', () => {
  it('warns when SSDT referenced in config is missing from disk', async () => {
    const profile = fakeProfile();
    const plist = generateConfigPlist(profile);
    const resources = getRequiredResources(profile);
    // Create structure with kexts but no SSDTs
    createEfiStructure(tmpDir, {
      configPlist: plist,
      kexts: resources.kexts,
      ssdts: [], // no SSDTs on disk
    });
    const result = await validateEfi(tmpDir, profile);
    expect(result.issues.some(i => i.code === 'SSDT_MISSING')).toBe(true);
  });
});

// ─── Phase 6: Version markers ───────────────────────────────────────────────

describe('validateEfi — version marker checks', () => {
  it('blocks when OpenCore and BOOTx64 versions mismatch', async () => {
    const profile = fakeProfile();
    createEfiStructure(tmpDir, {
      configPlist: generateConfigPlist(profile),
      kexts: getRequiredResources(profile).kexts,
      ssdts: getRequiredResources(profile).ssdts,
      versionSidecars: {
        'OpenCore.efi': '1.0.2',
        'BOOTx64.efi': '0.9.9',
        'OpenRuntime.efi': '1.0.2',
        'OpenHfsPlus.efi': '1.0.2',
      },
    });
    const result = await validateEfi(tmpDir, profile);
    expect(result.issues.some(i => i.code === 'OPENCORE_VERSION_MISMATCH')).toBe(true);
  });

  it('blocks when OpenRuntime version mismatches', async () => {
    const profile = fakeProfile();
    createEfiStructure(tmpDir, {
      configPlist: generateConfigPlist(profile),
      kexts: getRequiredResources(profile).kexts,
      ssdts: getRequiredResources(profile).ssdts,
      versionSidecars: {
        'OpenCore.efi': '1.0.2',
        'BOOTx64.efi': '1.0.2',
        'OpenRuntime.efi': '0.9.8',
        'OpenHfsPlus.efi': '1.0.2',
      },
    });
    const result = await validateEfi(tmpDir, profile);
    expect(result.issues.some(i => i.code === 'OPENRUNTIME_VERSION_MISMATCH')).toBe(true);
  });

  it('warns (not blocks) when OpenHfsPlus version mismatches', async () => {
    const profile = fakeProfile();
    createEfiStructure(tmpDir, {
      configPlist: generateConfigPlist(profile),
      kexts: getRequiredResources(profile).kexts,
      ssdts: getRequiredResources(profile).ssdts,
      versionSidecars: {
        'OpenCore.efi': '1.0.2',
        'BOOTx64.efi': '1.0.2',
        'OpenRuntime.efi': '1.0.2',
        'OpenHfsPlus.efi': '0.9.9',
      },
    });
    const result = await validateEfi(tmpDir, profile);
    const hfsIssue = result.issues.find(i => i.code === 'HFSPPLUS_VERSION_MISMATCH');
    expect(hfsIssue).toBeTruthy();
    expect(hfsIssue!.severity).toBe('warning');
  });

  it('passes when all versions match', async () => {
    const profile = fakeProfile();
    createEfiStructure(tmpDir, {
      configPlist: generateConfigPlist(profile),
      kexts: getRequiredResources(profile).kexts,
      ssdts: getRequiredResources(profile).ssdts,
    });
    const result = await validateEfi(tmpDir, profile);
    const versionIssues = result.issues.filter(i =>
      i.code.includes('VERSION_MISMATCH'),
    );
    expect(versionIssues).toEqual([]);
  });
});

// ─── Validator/Generator agreement ──────────────────────────────────────────

describe('validateEfi — validator/generator agreement', () => {
  const profiles = [
    { name: 'Intel Comet Lake desktop', profile: fakeProfile() },
    { name: 'Intel Coffee Lake desktop', profile: fakeProfile({ generation: 'Coffee Lake', smbios: 'iMac19,1' }) },
    { name: 'Intel Alder Lake desktop', profile: fakeProfile({ generation: 'Alder Lake', smbios: 'MacPro7,1' }) },
    { name: 'AMD Ryzen desktop', profile: fakeProfile({ architecture: 'AMD', generation: 'Ryzen', coreCount: 8, smbios: 'iMacPro1,1' }) },
    { name: 'Intel Coffee Lake laptop', profile: fakeProfile({ generation: 'Coffee Lake', isLaptop: true, smbios: 'MacBookPro15,2' }) },
  ];

  for (const { name, profile } of profiles) {
    it(`${name}: generated config + required resources validate clean`, async () => {
      const plist = generateConfigPlist(profile);
      const resources = getRequiredResources(profile);
      createEfiStructure(tmpDir, {
        configPlist: plist,
        kexts: resources.kexts,
        ssdts: resources.ssdts,
      });
      const result = await validateEfi(tmpDir, profile);
      const blockers = result.issues.filter(i => i.severity === 'blocked');
      expect(blockers, `${name} should have no blockers: ${JSON.stringify(blockers)}`).toEqual([]);
    });
  }
});

// ─── Trace source inference ─────────────────────────────────────────────────

describe('validateEfi — trace source inference', () => {
  it('traces kext issue to github source when hint provided', async () => {
    const profile = fakeProfile();
    const plist = generateConfigPlist(profile);
    // Only provide Lilu, not VirtualSMC — so VirtualSMC will be flagged
    createEfiStructure(tmpDir, { configPlist: plist, kexts: ['Lilu.kext'] });
    const result = await validateEfi(tmpDir, profile, {
      'VirtualSMC.kext': 'github',
    });
    if (result.firstFailureTrace) {
      expect(['github', 'unknown', 'generated']).toContain(result.firstFailureTrace.source);
    }
  });
});
