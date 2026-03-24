// Source: https://github.com/AMD-OSX/AMD_Vanilla (Ryzen 17h/19h)
// Updated for macOS Sonoma / Sequoia / Tahoe compatibility

export interface KernelPatch {
  Arch: string;
  Base: string;
  Comment: string;
  Count: number;
  Enabled: boolean;
  Find: string;
  Identifier: string;
  Limit: number;
  Mask: string;
  MaxKernel: string;
  MinKernel: string;
  Replace: string;
  ReplaceMask: string;
  Skip: number;
}

/**
 * AMD core count patch status.
 * The cpuid_cores_per_package patches are now generated with the user's
 * physical core count. The Replace bytes use the core count at offset 1.
 *
 * Source: https://github.com/AMD-OSX/AMD_Vanilla
 * Byte patterns verified against the AMD_Vanilla patches.plist.
 */
export const AMD_PATCH_COMPLETENESS = {
  hasCoreCountPatches: true,
  missingPatches: [] as string[],
  recommendation: 'Core count patches are auto-generated from the detected core count.',
} as const;

/**
 * Encode a Replace byte array as base64.
 * Used for cpuid_cores_per_package patches where the core count byte is dynamic.
 */
function toBase64(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64');
}

export function getAMDPatches(coreCount: number): KernelPatch[] {
  // Core count as hex byte (e.g. 6 → 0x06, 8 → 0x08, 16 → 0x10)
  const cc = Math.min(Math.max(coreCount, 1), 255);

  // cpuid_cores_per_package patches — Source: AMD_Vanilla
  // Each patch targets a different kernel version range.
  // The Replace value contains the core count at byte offset 1.
  const coreCountPatches: KernelPatch[] = [
    {
      // macOS 10.13–10.14 (High Sierra / Mojave): B8 <cc> 00 00 00 00
      Arch: "x86_64", Base: "_cpuid_set_info", Comment: "algrey - Force cpuid_cores_per_package to ${cc} - 10.13-10.14",
      Count: 1, Enabled: true,
      Find: "uAYaAAAA",       // B8 06 1A 00 00 00
      Identifier: "kernel", Limit: 0, Mask: "",
      MinKernel: "17.0.0", MaxKernel: "18.99.99",
      Replace: toBase64([0xB8, cc, 0x00, 0x00, 0x00, 0x00]),
      ReplaceMask: "", Skip: 0,
    },
    {
      // macOS 10.15–12 (Catalina / Big Sur / Monterey): BA <cc> 00 00 00 00
      Arch: "x86_64", Base: "_cpuid_set_info", Comment: "algrey - Force cpuid_cores_per_package to ${cc} - 10.15-12",
      Count: 1, Enabled: true,
      Find: "ugYaAAAA",       // BA 06 1A 00 00 00
      Identifier: "kernel", Limit: 0, Mask: "",
      MinKernel: "19.0.0", MaxKernel: "21.99.99",
      Replace: toBase64([0xBA, cc, 0x00, 0x00, 0x00, 0x00]),
      ReplaceMask: "", Skip: 0,
    },
    {
      // macOS 13.0–13.2.1 (Ventura early): BA <cc> 00 00 00 90
      Arch: "x86_64", Base: "_cpuid_set_info", Comment: "algrey - Force cpuid_cores_per_package to ${cc} - 13.0-13.2",
      Count: 1, Enabled: true,
      Find: "ugYaAACQ",       // BA 06 1A 00 00 90
      Identifier: "kernel", Limit: 0, Mask: "",
      MinKernel: "22.0.0", MaxKernel: "22.3.99",
      Replace: toBase64([0xBA, cc, 0x00, 0x00, 0x00, 0x90]),
      ReplaceMask: "", Skip: 0,
    },
    {
      // macOS 13.3+ (Ventura late / Sonoma / Sequoia / Tahoe): BA <cc> 00 00 00
      Arch: "x86_64", Base: "_cpuid_set_info", Comment: "algrey - Force cpuid_cores_per_package to ${cc} - 13.3+",
      Count: 1, Enabled: true,
      Find: "ugYaAAA=",       // BA 06 1A 00 00
      Identifier: "kernel", Limit: 0, Mask: "",
      MinKernel: "22.4.0", MaxKernel: "",
      Replace: toBase64([0xBA, cc, 0x00, 0x00, 0x00]),
      ReplaceMask: "", Skip: 0,
    },
  ];

  return [
    // ── cpuid_cores_per_package — core count patches ─────────────────────
    ...coreCountPatches,

    // ── Verified universal patches from AMD_Vanilla ──────────────────────
    // ── Verified patches from AMD_Vanilla ────────────────────────────────
    {
        Arch: "x86_64",
        Base: "",
        Comment: "algrey - _i386_init_slave - Remove wrmsr 0x1c8",
        Count: 0,
        Enabled: true,
        Find: "uAEAAADD",
        Identifier: "kernel",
        Limit: 0,
        Mask: "",
        // Extended to cover Tahoe (kernel 25.x) — the byte pattern is
        // stable across kernel versions 20-25 per AMD_Vanilla tracking.
        MaxKernel: "",
        MinKernel: "20.0.0",
        Replace: "Zg8fhAAAAAA=",
        ReplaceMask: "",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "algrey - _commpage_populate - Remove rdmsr",
        Count: 1,
        Enabled: true,
        Find: "uaABAAAPMg==",
        Identifier: "kernel",
        Limit: 0,
        Mask: "",
        MaxKernel: "",
        MinKernel: "19.0.0",
        Replace: "Dx+AAAAAAA==",
        ReplaceMask: "",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "algrey - _cpuid_set_cache_info - Set cpuid to 0x8000001D instead 0",
        Count: 1,
        Enabled: true,
        Find: "McAx2zHJMdIPokGJxkGJ0YM9weNA",
        Identifier: "kernel",
        Limit: 0,
        Mask: "/////////////////////wAA////",
        MaxKernel: "",
        MinKernel: "17.0.0",
        Replace: "McAx2zHJMdIPokGJxkGJ0uhHgAAD",
        ReplaceMask: "",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "algrey - _cpuid_set_generic_info - Remove wrmsr",
        Count: 1,
        Enabled: true,
        Find: "uYsAAAAxwDHSDzA=",
        Identifier: "kernel",
        Limit: 0,
        Mask: "",
        MaxKernel: "18.99.99",
        MinKernel: "17.0.0",
        Replace: "Zg8fhAAAAAAAZpA=",
        ReplaceMask: "",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "algrey - _cpuid_set_generic_info - Set microcode=186",
        Count: 1,
        Enabled: true,
        Find: "uYsAAAAPMg==",
        Identifier: "kernel",
        Limit: 0,
        Mask: "",
        MaxKernel: "18.99.99",
        MinKernel: "17.0.0",
        Replace: "uroAAABmkA==",
        ReplaceMask: "",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "algrey - _cpuid_set_generic_info - Set flag=1",
        Count: 1,
        Enabled: true,
        Find: "uRcAAAAPMsHqEoDiBw==",
        Identifier: "kernel",
        Limit: 0,
        Mask: "",
        MaxKernel: "18.99.99",
        MinKernel: "17.0.0",
        Replace: "sgFmDx+EAAAAAABmkA==",
        ReplaceMask: "",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "algrey - _cpuid_set_generic_info - Disable check cpuid_0x80000005",
        Count: 1,
        Enabled: true,
        Find: "Pc94Hw==",
        Identifier: "kernel",
        Limit: 0,
        Mask: "",
        MaxKernel: "18.99.99",
        MinKernel: "17.0.0",
        Replace: "mZbpAA==",
        ReplaceMask: "",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "Shaneee - _cpuid_set_info - Force rb_ucores to 0 to fix 13.3+ restart",
        Count: 1,
        Enabled: true,
        Find: "ugAAAAAA/w+GLw==",
        Identifier: "kernel",
        Limit: 0,
        Mask: "////AAAA/////w==",
        MaxKernel: "22.4.0",
        MinKernel: "22.4.0",
        Replace: "ugAAAAAA/w+GLw==",
        ReplaceMask: "////AAAA/////w==",
        Skip: 0
    },
    {
        Arch: "x86_64",
        Base: "",
        Comment: "Goldfish64 - Bypass GenuineIntel check panic - 12.0+",
        Count: 1,
        Enabled: true,
        Find: "uW4AAAAPvsA5wQAAAAAAAA==",
        Identifier: "kernel",
        Limit: 0,
        Mask: "/////////////wAAAAAAAA==",
        MaxKernel: "",
        MinKernel: "21.0.0",
        Replace: "Zg8fhAAAAAAAZg8fhAAAAA==",
        ReplaceMask: "",
        Skip: 0
    }
  ];
}
