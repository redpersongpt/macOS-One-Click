// Source: https://github.com/AMD-OSX/AMD_Vanilla (Ryzen 17h/19h)
// Updated for macOS Sonoma / Sequoia / Tahoe compatibility

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

/// A single OpenCore Kernel → Patch entry for AMD systems.
#[derive(Debug, Clone)]
pub struct KernelPatch {
    pub arch: String,
    pub base: String,
    pub comment: String,
    pub count: u32,
    pub enabled: bool,
    pub find: String,
    pub identifier: String,
    pub limit: u32,
    pub mask: String,
    pub max_kernel: String,
    pub min_kernel: String,
    pub replace: String,
    pub replace_mask: String,
    pub skip: u32,
}

fn to_base64(bytes: &[u8]) -> String {
    BASE64.encode(bytes)
}

/// Generate AMD kernel patches for a given physical core count.
/// Returns all cpuid_cores_per_package patches plus verified universal patches
/// from AMD_Vanilla.
pub fn get_amd_patches(core_count: u32) -> Vec<KernelPatch> {
    let cc = core_count.clamp(1, 255) as u8;

    let patches = vec![
        // ── cpuid_cores_per_package — core count patches ─────────────────────
        // macOS 10.13–10.14 (High Sierra / Mojave): B8 <cc> 00 00 00 00
        KernelPatch {
            arch: "x86_64".into(),
            base: "_cpuid_set_info".into(),
            comment: format!("algrey - Force cpuid_cores_per_package to {} - 10.13-10.14", cc),
            count: 1, enabled: true,
            find: "uAYaAAAA".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "17.0.0".into(), max_kernel: "18.99.99".into(),
            replace: to_base64(&[0xB8, cc, 0x00, 0x00, 0x00, 0x00]),
            replace_mask: String::new(), skip: 0,
        },
        // macOS 10.15–12 (Catalina / Big Sur / Monterey): BA <cc> 00 00 00 00
        KernelPatch {
            arch: "x86_64".into(),
            base: "_cpuid_set_info".into(),
            comment: format!("algrey - Force cpuid_cores_per_package to {} - 10.15-12", cc),
            count: 1, enabled: true,
            find: "ugYaAAAA".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "19.0.0".into(), max_kernel: "21.99.99".into(),
            replace: to_base64(&[0xBA, cc, 0x00, 0x00, 0x00, 0x00]),
            replace_mask: String::new(), skip: 0,
        },
        // macOS 13.0–13.2.1 (Ventura early): BA <cc> 00 00 00 90
        KernelPatch {
            arch: "x86_64".into(),
            base: "_cpuid_set_info".into(),
            comment: format!("algrey - Force cpuid_cores_per_package to {} - 13.0-13.2", cc),
            count: 1, enabled: true,
            find: "ugYaAACQ".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "22.0.0".into(), max_kernel: "22.3.99".into(),
            replace: to_base64(&[0xBA, cc, 0x00, 0x00, 0x00, 0x90]),
            replace_mask: String::new(), skip: 0,
        },
        // macOS 13.3+ (Ventura late / Sonoma / Sequoia / Tahoe): BA <cc> 00 00 00
        KernelPatch {
            arch: "x86_64".into(),
            base: "_cpuid_set_info".into(),
            comment: format!("algrey - Force cpuid_cores_per_package to {} - 13.3+", cc),
            count: 1, enabled: true,
            find: "ugYaAAA=".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "22.4.0".into(), max_kernel: String::new(),
            replace: to_base64(&[0xBA, cc, 0x00, 0x00, 0x00]),
            replace_mask: String::new(), skip: 0,
        },
        // ── Verified universal patches from AMD_Vanilla ──────────────────────
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "algrey - _i386_init_slave - Remove wrmsr 0x1c8".into(),
            count: 0, enabled: true,
            find: "uAEAAADD".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "20.0.0".into(), max_kernel: String::new(),
            replace: "Zg8fhAAAAAA=".into(),
            replace_mask: String::new(), skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "algrey - _commpage_populate - Remove rdmsr".into(),
            count: 1, enabled: true,
            find: "uaABAAAPMg==".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "19.0.0".into(), max_kernel: String::new(),
            replace: "Dx+AAAAAAA==".into(),
            replace_mask: String::new(), skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "algrey - _cpuid_set_cache_info - Set cpuid to 0x8000001D instead 0".into(),
            count: 1, enabled: true,
            find: "McAx2zHJMdIPokGJxkGJ0YM9weNA".into(),
            identifier: "kernel".into(),
            limit: 0,
            mask: "/////////////////////wAA////".into(),
            min_kernel: "17.0.0".into(), max_kernel: String::new(),
            replace: "McAx2zHJMdIPokGJxkGJ0uhHgAAD".into(),
            replace_mask: String::new(), skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "algrey - _cpuid_set_generic_info - Remove wrmsr".into(),
            count: 1, enabled: true,
            find: "uYsAAAAxwDHSDzA=".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "17.0.0".into(), max_kernel: "18.99.99".into(),
            replace: "Zg8fhAAAAAAAZpA=".into(),
            replace_mask: String::new(), skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "algrey - _cpuid_set_generic_info - Set microcode=186".into(),
            count: 1, enabled: true,
            find: "uYsAAAAPMg==".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "17.0.0".into(), max_kernel: "18.99.99".into(),
            replace: "uroAAABmkA==".into(),
            replace_mask: String::new(), skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "algrey - _cpuid_set_generic_info - Set flag=1".into(),
            count: 1, enabled: true,
            find: "uRcAAAAPMsHqEoDiBw==".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "17.0.0".into(), max_kernel: "18.99.99".into(),
            replace: "sgFmDx+EAAAAAABmkA==".into(),
            replace_mask: String::new(), skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "algrey - _cpuid_set_generic_info - Disable check cpuid_0x80000005".into(),
            count: 1, enabled: true,
            find: "Pc94Hw==".into(),
            identifier: "kernel".into(),
            limit: 0, mask: String::new(),
            min_kernel: "17.0.0".into(), max_kernel: "18.99.99".into(),
            replace: "mZbpAA==".into(),
            replace_mask: String::new(), skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "Shaneee - _cpuid_set_info - Force rb_ucores to 0 to fix 13.3+ restart".into(),
            count: 1, enabled: true,
            find: "ugAAAAAA/w+GLw==".into(),
            identifier: "kernel".into(),
            limit: 0,
            mask: "////AAAA/////w==".into(),
            min_kernel: "22.4.0".into(), max_kernel: "22.4.0".into(),
            replace: "ugAAAAAA/w+GLw==".into(),
            replace_mask: "////AAAA/////w==".into(),
            skip: 0,
        },
        KernelPatch {
            arch: "x86_64".into(), base: String::new(),
            comment: "Goldfish64 - Bypass GenuineIntel check panic - 12.0+".into(),
            count: 1, enabled: true,
            find: "uW4AAAAPvsA5wQAAAAAAAA==".into(),
            identifier: "kernel".into(),
            limit: 0,
            mask: "/////////////wAAAAAAAA==".into(),
            min_kernel: "21.0.0".into(), max_kernel: String::new(),
            replace: "Zg8fhAAAAAAAZg8fhAAAAA==".into(),
            replace_mask: String::new(), skip: 0,
        },
    ];

    patches
}
