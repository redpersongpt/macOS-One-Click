//! OpenCore config.plist generator.
//! Ported from electron/configGenerator.ts — ALL logic preserved verbatim.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Writer;
use rand::Rng;
use regex::Regex;
use std::collections::HashSet;
use std::io::Cursor;
use tracing::info;
use uuid::Uuid;

use crate::error::AppError;

use super::amd_patches::get_amd_patches;
use super::rules::*;
use super::wifi_policy::*;

// ── SIP Policy ──────────────────────────────────────────────────────────────

pub struct SipPolicy {
    pub value: String,
    pub reason: String,
}

pub fn get_sip_policy(_architecture: &str, _generation: &str, target_os: &str, gpu: &str, gpu_devices: &Option<Vec<HardwareGpuDeviceSummary>>) -> SipPolicy {
    let devices = get_profile_gpu_devices(gpu, gpu_devices);
    let assessments: Vec<GpuAssessment> = devices.iter().map(classify_gpu).collect();
    let os_ver = parse_macos_version(target_os);

    let has_oclp_path = assessments.iter().any(|a| {
        a.tier == GpuSupportTier::SupportedWithLimit
            && a.max_macos_version.map_or(false, |m| os_ver > m)
    });

    if has_oclp_path {
        SipPolicy {
            value: "7w8AAA==".into(), // 0x00000FEF LE
            reason: "OCLP root-patching path detected — near-full SIP disable required".into(),
        }
    } else {
        SipPolicy {
            value: "AAAAAA==".into(), // 0x00000000
            reason: "SIP enabled — standard OpenCore path (kexts load before macOS)".into(),
        }
    }
}

// ── Codeless / Plugin Kexts ─────────────────────────────────────────────────

fn codeless_kexts() -> HashSet<&'static str> {
    ["AppleMCEReporterDisabler.kext"].into_iter().collect()
}

fn plugin_kext_parents() -> Vec<(&'static str, &'static str)> {
    vec![("VoodooI2CHID.kext", "VoodooI2C.kext")]
}

pub fn resolve_kext_bundle_path(kext_name: &str) -> String {
    for &(plugin, parent) in &plugin_kext_parents() {
        if kext_name == plugin {
            return format!("{}/Contents/PlugIns/{}", parent, kext_name);
        }
    }
    kext_name.to_string()
}

pub fn resolve_kext_executable_path(kext_name: &str) -> String {
    if codeless_kexts().contains(kext_name) { return String::new(); }
    let base = kext_name.strip_suffix(".kext").unwrap_or(kext_name);
    format!("Contents/MacOS/{}", base)
}

// ── Audio Codec → Layout-ID Map ─────────────────────────────────────────────

fn codec_layout_map() -> Vec<(&'static str, u32)> {
    vec![
        ("alc215", 18), ("alc221", 11), ("alc222", 11), ("alc225", 28),
        ("alc230", 13), ("alc233", 3), ("alc235", 11), ("alc236", 3),
        ("alc245", 11), ("alc255", 3), ("alc256", 5), ("alc257", 11),
        ("alc260", 11), ("alc262", 7), ("alc269", 1), ("alc270", 3),
        ("alc272", 3), ("alc274", 21), ("alc275", 3), ("alc280", 3),
        ("alc282", 3), ("alc283", 1), ("alc284", 3), ("alc285", 11),
        ("alc286", 3), ("alc288", 3), ("alc289", 11), ("alc290", 3),
        ("alc292", 12), ("alc293", 11), ("alc294", 11), ("alc295", 1),
        ("alc298", 3), ("alc299", 21), ("alc662", 5), ("alc663", 3),
        ("alc668", 3), ("alc670", 12), ("alc671", 12), ("alc700", 11),
        ("alc882", 5), ("alc883", 1), ("alc885", 1), ("alc887", 1),
        ("alc888", 1), ("alc889", 1), ("alc891", 1), ("alc892", 1),
        ("alc897", 11), ("alc898", 1), ("alc899", 1), ("alc1150", 1),
        ("alc1200", 1), ("alc1220", 1),
    ]
}

pub fn resolve_audio_layout_id(codec_name: Option<&str>) -> u32 {
    let codec = match codec_name {
        None => return 1,
        Some(c) => c,
    };
    let lower: String = codec.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect();
    let alc_re = Regex::new(r"alc\d+").unwrap();
    if let Some(m) = alc_re.find(&lower) {
        let key = m.as_str();
        for &(k, v) in &codec_layout_map() {
            if k == key { return v; }
        }
    }
    1
}

struct PlatformIdentity {
    serial: String,
    mlb: String,
    rom: String,
    system_uuid: String,
}

fn random_upper_alnum(len: usize) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::rng();

    (0..len)
        .map(|_| {
            let index = rng.random_range(0..ALPHABET.len());
            ALPHABET[index] as char
        })
        .collect()
}

fn generate_platform_identity() -> PlatformIdentity {
    let serial = format!("OC{}", random_upper_alnum(10));
    let mlb = format!("OCB{}", random_upper_alnum(14));

    let mut rom_bytes = [0u8; 6];
    rand::rng().fill(&mut rom_bytes);

    PlatformIdentity {
        serial,
        mlb,
        rom: BASE64.encode(rom_bytes),
        system_uuid: Uuid::new_v4().to_string().to_uppercase(),
    }
}

// ── Quirks ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct Quirks {
    avoid_runtime_defrag: bool,
    devirtualise_mmio: bool,
    enable_safe_mode_slide: bool,
    enable_write_unprotector: bool,
    protect_memory_regions: bool,
    protect_uefi_services: bool,
    provide_custom_slide: bool,
    rebuild_apple_memory_map: bool,
    setup_virtual_map: bool,
    sync_runtime_permissions: bool,
    apple_cpu_pm_cfg_lock: bool,
    apple_xcpm_cfg_lock: bool,
    apple_xcpm_extra_msrs: bool,
    disable_io_mapper: bool,
    disable_rtc_checksum: bool,
    fixup_apple_efi_images: bool,
    panic_no_kext_dump: bool,
    power_timeout_kernel_panic: bool,
    provide_current_cpu_info: bool,
    xhci_port_limit: bool,
    ignore_invalid_flex_ratio: bool,
    request_boot_var_routing: bool,
    release_usb_ownership: bool,
    unblock_fs_connect: bool,
}

fn base_quirks() -> Quirks {
    Quirks {
        avoid_runtime_defrag: true,
        devirtualise_mmio: false,
        enable_safe_mode_slide: true,
        enable_write_unprotector: false,
        protect_memory_regions: false,
        protect_uefi_services: false,
        provide_custom_slide: true,
        rebuild_apple_memory_map: true,
        setup_virtual_map: true,
        sync_runtime_permissions: true,
        apple_cpu_pm_cfg_lock: true,
        apple_xcpm_cfg_lock: true,
        apple_xcpm_extra_msrs: false,
        disable_io_mapper: true,
        disable_rtc_checksum: false,
        fixup_apple_efi_images: false,
        panic_no_kext_dump: true,
        power_timeout_kernel_panic: true,
        provide_current_cpu_info: false,
        xhci_port_limit: false,
        ignore_invalid_flex_ratio: false,
        request_boot_var_routing: true,
        release_usb_ownership: true,
        unblock_fs_connect: false,
    }
}

fn get_quirks_for_generation(
    gen: &str, motherboard: &str, is_vm: bool, strategy: &str,
    target_os: &str, is_laptop: bool,
) -> Quirks {
    let mut q = base_quirks();
    let mb = motherboard.to_lowercase();

    if is_vm { q.provide_current_cpu_info = true; }

    if strategy == "conservative" {
        q.devirtualise_mmio = true;
        q.setup_virtual_map = true;
        q.disable_io_mapper = true;
        q.apple_cpu_pm_cfg_lock = true;
        q.apple_xcpm_cfg_lock = true;
    }

    match gen {
        "Penryn" | "Wolfdale" | "Yorkfield" | "Nehalem" | "Westmere" | "Arrandale" | "Clarkdale"
        | "Sandy Bridge" | "Ivy Bridge" => {
            q.enable_write_unprotector = true;
            q.rebuild_apple_memory_map = false;
            q.sync_runtime_permissions = false;
            q.ignore_invalid_flex_ratio = true;
            if matches!(gen, "Penryn" | "Wolfdale" | "Yorkfield" | "Nehalem" | "Westmere" | "Arrandale" | "Clarkdale") {
                q.apple_xcpm_cfg_lock = false;
            }
        }
        "Haswell" | "Broadwell" => {
            q.enable_write_unprotector = true;
            q.rebuild_apple_memory_map = false;
            q.sync_runtime_permissions = false;
            q.ignore_invalid_flex_ratio = true;
            q.apple_cpu_pm_cfg_lock = false;
        }
        "Skylake" | "Kaby Lake" => {
            q.enable_write_unprotector = true;
            q.rebuild_apple_memory_map = false;
            q.sync_runtime_permissions = false;
            q.apple_cpu_pm_cfg_lock = false;
        }
        "Ice Lake" => {
            q.enable_write_unprotector = false;
            q.devirtualise_mmio = true;
            q.protect_memory_regions = true;
            q.protect_uefi_services = true;
            q.rebuild_apple_memory_map = true;
            q.sync_runtime_permissions = true;
            q.apple_cpu_pm_cfg_lock = false;
        }
        "Ivy Bridge-E" => {
            q.enable_write_unprotector = true;
            q.rebuild_apple_memory_map = false;
            q.sync_runtime_permissions = false;
            q.ignore_invalid_flex_ratio = true;
            q.apple_xcpm_extra_msrs = true;
            q.apple_cpu_pm_cfg_lock = true;
        }
        "Haswell-E" | "Broadwell-E" => {
            q.enable_write_unprotector = true;
            q.rebuild_apple_memory_map = false;
            q.sync_runtime_permissions = false;
            q.ignore_invalid_flex_ratio = true;
            q.apple_xcpm_extra_msrs = true;
            q.apple_cpu_pm_cfg_lock = false;
        }
        "Cascade Lake-X" => {
            q.enable_write_unprotector = false;
            q.devirtualise_mmio = true;
            q.protect_uefi_services = true;
            q.rebuild_apple_memory_map = true;
            q.sync_runtime_permissions = true;
            q.setup_virtual_map = false;
            q.apple_xcpm_extra_msrs = true;
            q.apple_cpu_pm_cfg_lock = false;
        }
        "Coffee Lake" => {
            q.enable_write_unprotector = false;
            q.rebuild_apple_memory_map = true;
            q.sync_runtime_permissions = true;
            q.devirtualise_mmio = true;
            q.apple_cpu_pm_cfg_lock = false;
            q.setup_virtual_map = true;
            if mb.contains("z390") {
                q.protect_uefi_services = true;
                q.setup_virtual_map = false;
            }
        }
        "Comet Lake" => {
            q.enable_write_unprotector = false;
            q.rebuild_apple_memory_map = true;
            q.sync_runtime_permissions = true;
            q.devirtualise_mmio = true;
            q.apple_cpu_pm_cfg_lock = false;
            q.protect_uefi_services = true;
            q.setup_virtual_map = false;
        }
        "Rocket Lake" | "Alder Lake" | "Raptor Lake" => {
            q.enable_write_unprotector = false;
            q.devirtualise_mmio = true;
            q.protect_uefi_services = true;
            q.setup_virtual_map = false;
            q.rebuild_apple_memory_map = true;
            q.sync_runtime_permissions = true;
            q.provide_current_cpu_info = true;
            q.apple_cpu_pm_cfg_lock = false;
        }
        "Bulldozer" => {
            q.enable_write_unprotector = true;
            q.rebuild_apple_memory_map = false;
            q.sync_runtime_permissions = false;
            q.setup_virtual_map = true;
            q.apple_cpu_pm_cfg_lock = false;
            q.apple_xcpm_cfg_lock = false;
            q.provide_current_cpu_info = true;
        }
        "Ryzen" | "Threadripper" => {
            q.enable_write_unprotector = false;
            q.devirtualise_mmio = false;
            q.rebuild_apple_memory_map = true;
            q.sync_runtime_permissions = true;
            q.setup_virtual_map = true;
            q.apple_cpu_pm_cfg_lock = false;
            q.apple_xcpm_cfg_lock = false;
            q.provide_current_cpu_info = true;
            if mb.contains("x570") || mb.contains("b550") || mb.contains("a520") || mb.contains("trx40") {
                q.setup_virtual_map = false;
            }
            if mb.contains("trx40") { q.devirtualise_mmio = true; }
        }
        _ => {}
    }

    // HEDT overrides
    if mb.contains("x99") {
        q.enable_write_unprotector = true;
        q.devirtualise_mmio = false;
        q.rebuild_apple_memory_map = false;
        q.sync_runtime_permissions = false;
        q.setup_virtual_map = true;
    } else if mb.contains("x299") {
        q.enable_write_unprotector = false;
        q.devirtualise_mmio = true;
        q.protect_uefi_services = true;
        q.rebuild_apple_memory_map = true;
        q.sync_runtime_permissions = true;
        q.setup_virtual_map = false;
    }

    // ASUS RTC
    if mb.contains("asus") || mb.contains("rog") || mb.contains("strix") || mb.contains("tuf") {
        q.disable_rtc_checksum = true;
    }
    // HP
    if mb.contains("hp") || mb.contains("hewlett") { q.unblock_fs_connect = true; }

    // Tahoe FixupAppleEfiImages
    let os_ver = parse_macos_version(target_os);
    if os_ver >= 26.0 {
        let needs_fixup = ["Skylake", "Kaby Lake", "Ice Lake", "Coffee Lake", "Comet Lake",
            "Rocket Lake", "Alder Lake", "Raptor Lake", "Cascade Lake-X",
            "Ryzen", "Threadripper", "Bulldozer"];
        if needs_fixup.contains(&gen) { q.fixup_apple_efi_images = true; }
    }

    // Laptop ProtectMemoryRegions
    if is_laptop && ["Skylake", "Kaby Lake", "Coffee Lake", "Comet Lake", "Ice Lake"].contains(&gen) {
        q.protect_memory_regions = true;
    }

    q
}

// ── TAHOE unsupported generations ───────────────────────────────────────────

fn tahoe_unsupported_generations() -> HashSet<&'static str> {
    [
        "Wolfdale", "Yorkfield", "Nehalem", "Westmere", "Arrandale", "Clarkdale",
        "Penryn", "Sandy Bridge", "Ivy Bridge", "Haswell", "Broadwell",
    ].into_iter().collect()
}

// ── SMBIOS Lookup ───────────────────────────────────────────────────────────

pub fn get_smbios_for_profile(
    architecture: &str, generation: &str, is_laptop: bool, is_vm: bool,
    _motherboard: &str, target_os: &str, gpu: &str,
    gpu_devices: &Option<Vec<HardwareGpuDeviceSummary>>,
) -> Result<String, AppError> {
    if is_vm {
        return Ok(if architecture == "AMD" || generation.contains("Ryzen") || generation.contains("Threadripper") {
            "MacPro7,1"
        } else { "iMacPro1,1" }.into());
    }

    let os_ver = parse_macos_version(target_os);
    let devices = get_profile_gpu_devices(gpu, gpu_devices);
    let assessments: Vec<GpuAssessment> = devices.iter().map(classify_gpu).collect();
    let best = get_best_supported_gpu_path(&devices, Some(os_ver));
    let has_discrete_display = best.as_ref().map_or(false, |b| b.is_likely_discrete)
        || assessments.iter().any(|a| a.is_likely_discrete && a.tier != GpuSupportTier::Unsupported);

    if architecture == "AMD" {
        if generation == "Threadripper" { return Ok("MacPro7,1".into()); }
        if generation == "Bulldozer" { return Ok("iMacPro1,1".into()); }
        if os_ver >= 10.15 && has_mac_pro_era_amd_gpu(&devices) { return Ok("MacPro7,1".into()); }
        return Ok("iMacPro1,1".into());
    }

    // Tahoe
    if os_ver >= 26.0 {
        if tahoe_unsupported_generations().contains(generation) {
            return Err(AppError::new("UNSUPPORTED_GENERATION",
                format!("{} is not supported on {}. macOS Tahoe requires Skylake or newer.", generation, target_os)));
        }
        if is_laptop { return Ok("MacBookPro16,1".into()); }
        if generation.contains("-E") || generation.contains("-X") { return Ok("MacPro7,1".into()); }
        if ["Rocket Lake", "Alder Lake", "Raptor Lake"].contains(&generation) { return Ok("MacPro7,1".into()); }
        return Ok("iMac20,1".into());
    }

    if is_laptop {
        return Ok(match generation {
            "Arrandale" | "Clarkdale" => if os_ver >= 12.0 { "MacBookPro11,4" } else { "MacBookPro6,2" },
            "Sandy Bridge" | "Ivy Bridge" => {
                if os_ver >= 13.0 { "MacBookPro14,1" }
                else if os_ver >= 12.0 { "MacBookPro11,4" }
                else { "MacBookPro10,1" }
            }
            "Haswell" => if os_ver >= 13.0 { "MacBookPro14,1" } else { "MacBookPro11,4" },
            "Broadwell" => if os_ver >= 13.0 { "MacBookPro14,1" } else { "MacBookPro12,1" },
            "Skylake" => if os_ver >= 13.0 { "MacBookPro14,1" } else { "MacBookPro13,1" },
            "Kaby Lake" => "MacBookPro14,1",
            "Coffee Lake" => "MacBookPro15,2",
            "Ice Lake" => "MacBookAir9,1",
            "Comet Lake" | "Rocket Lake" | "Alder Lake" | "Raptor Lake" => "MacBookPro16,1",
            _ => "MacBookPro16,1",
        }.into());
    }

    // HEDT
    if generation.contains("-E") || generation.contains("-X") {
        if generation == "Ivy Bridge-E" {
            return Ok(if os_ver >= 13.0 { "MacPro7,1" } else { "MacPro6,1" }.into());
        }
        return Ok("iMacPro1,1".into());
    }

    // Desktop
    Ok(match generation {
        "Wolfdale" | "Yorkfield" | "Nehalem" | "Westmere" | "Clarkdale" | "Penryn" =>
            if os_ver >= 12.0 { "iMac14,4" } else { "iMac10,1" },
        "Sandy Bridge" => {
            if os_ver >= 13.0 { if has_discrete_display { "iMac18,2" } else { "iMac18,1" } }
            else if os_ver >= 12.0 { "iMac16,2" }
            else { "iMac12,2" }
        }
        "Ivy Bridge" => {
            if os_ver >= 13.0 { if has_discrete_display { "iMac18,2" } else { "iMac18,1" } }
            else if os_ver >= 12.0 { if has_discrete_display { "MacPro6,1" } else { "iMac16,2" } }
            else { "iMac13,2" }
        }
        "Haswell" => {
            if os_ver >= 13.0 { if has_discrete_display { "iMac18,2" } else { "iMac18,1" } }
            else if has_discrete_display { "iMac15,1" }
            else { "iMac14,4" }
        }
        "Broadwell" => if os_ver >= 13.0 { if has_discrete_display { "iMac18,2" } else { "iMac18,1" } } else { "iMac16,2" },
        "Skylake" => if os_ver >= 13.0 { if has_discrete_display { "iMac18,2" } else { "iMac18,1" } } else { "iMac17,1" },
        "Kaby Lake" => if has_discrete_display { "iMac18,3" } else { "iMac18,1" },
        "Coffee Lake" => "iMac19,1",
        "Comet Lake" => if has_discrete_display { "iMac20,2" } else { "iMac20,1" },
        "Rocket Lake" | "Alder Lake" | "Raptor Lake" => "MacPro7,1",
        _ => "iMac19,1",
    }.into())
}

// ── Required Resources ──────────────────────────────────────────────────────

pub struct RequiredResources {
    pub kexts: Vec<String>,
    pub ssdts: Vec<String>,
}

pub fn get_required_resources(
    architecture: &str, generation: &str, is_laptop: bool,
    motherboard: &str, target_os: &str, gpu: &str,
    gpu_devices: &Option<Vec<HardwareGpuDeviceSummary>>,
    input_stack: Option<&str>, wifi_chipset: Option<&str>,
) -> RequiredResources {
    let mut kexts: Vec<String> = vec!["Lilu.kext".into(), "VirtualSMC.kext".into()];
    let mut ssdts: Vec<String> = vec![];
    let os_ver = parse_macos_version(target_os);
    let devices = get_profile_gpu_devices(gpu, gpu_devices);
    let gpu_assessments: Vec<GpuAssessment> = devices.iter().map(classify_gpu).collect();
    let mb = motherboard.to_lowercase();

    let push_kext = |kexts: &mut Vec<String>, k: &str| {
        if !kexts.iter().any(|x| x == k) { kexts.push(k.into()); }
    };
    let push_ssdt = |ssdts: &mut Vec<String>, s: &str| {
        if !ssdts.iter().any(|x| x == s) { ssdts.push(s.into()); }
    };

    if architecture == "Intel" {
        push_kext(&mut kexts, "WhateverGreen.kext");
        push_kext(&mut kexts, "AppleALC.kext");
        if !is_laptop {
            push_kext(&mut kexts, "SMCProcessor.kext");
            push_kext(&mut kexts, "SMCSuperIO.kext");
            push_kext(&mut kexts, "IntelMausi.kext");
            push_kext(&mut kexts, "RealtekRTL8111.kext");
            push_kext(&mut kexts, "USBInjectAll.kext");
        }
    } else if architecture == "AMD" {
        if gpu_assessments.iter().any(|a| a.requires_noot_rx) {
            push_kext(&mut kexts, "NootRX.kext");
        } else if gpu_assessments.iter().any(|a| a.requires_nooted_red) {
            push_kext(&mut kexts, "NootedRed.kext");
        } else {
            push_kext(&mut kexts, "WhateverGreen.kext");
        }
        push_kext(&mut kexts, "AppleALC.kext");
    }

    if architecture == "AMD" {
        if generation == "Ryzen" || generation == "Threadripper" {
            push_kext(&mut kexts, "AMDRyzenCPUPowerManagement.kext");
        }
        if os_ver >= 12.0 { push_kext(&mut kexts, "AppleMCEReporterDisabler.kext"); }
    }

    // Laptop kexts
    if is_laptop {
        push_kext(&mut kexts, "SMCBatteryManager.kext");
        push_kext(&mut kexts, "ECEnabler.kext");

        let i2c_gens = ["Haswell", "Broadwell", "Skylake", "Kaby Lake", "Coffee Lake", "Comet Lake", "Ice Lake"];
        if input_stack == Some("i2c") && i2c_gens.contains(&generation) {
            push_kext(&mut kexts, "VoodooI2C.kext");
            push_kext(&mut kexts, "VoodooI2CHID.kext");
            push_ssdt(&mut ssdts, "SSDT-GPIO.aml");
            push_kext(&mut kexts, "VoodooPS2Controller.kext");
        } else {
            push_kext(&mut kexts, "VoodooPS2Controller.kext");
        }

        push_ssdt(&mut ssdts, "SSDT-PNLF.aml");

        if ["Sandy Bridge", "Ivy Bridge"].contains(&generation) {
            push_ssdt(&mut ssdts, "SSDT-XOSI.aml");
            push_ssdt(&mut ssdts, "SSDT-IMEI.aml");
        }
        if generation == "Ice Lake" { push_ssdt(&mut ssdts, "SSDT-RHUB.aml"); }

        let wifi_fam = classify_wifi_chipset_family(wifi_chipset);
        if ["Skylake", "Kaby Lake", "Coffee Lake", "Comet Lake", "Ice Lake"].contains(&generation)
            && wifi_fam == WifiChipsetFamily::Intel
        {
            push_kext(&mut kexts, "itlwm.kext");
        }
    }

    let wifi_fam = classify_wifi_chipset_family(wifi_chipset);
    if architecture == "Intel"
        && !is_laptop
        && ["Skylake", "Kaby Lake", "Coffee Lake", "Comet Lake", "Ice Lake", "Rocket Lake", "Alder Lake", "Raptor Lake"].contains(&generation)
        && wifi_fam == WifiChipsetFamily::Intel
    {
        push_kext(&mut kexts, "itlwm.kext");
    }

    // Bluetooth — paired with wifi chipset family
    match classify_wifi_chipset_family(wifi_chipset) {
        WifiChipsetFamily::Intel => {
            push_kext(&mut kexts, "IntelBluetoothFirmware.kext");
            push_kext(&mut kexts, "BlueToolFixup.kext");
        }
        WifiChipsetFamily::Broadcom => {
            push_kext(&mut kexts, "BrcmPatchRAM3.kext");
            push_kext(&mut kexts, "BrcmFirmwareData.kext");
            push_kext(&mut kexts, "BlueToolFixup.kext");
        }
        _ => {}
    }

    // NVMe fix — include by default for common problematic controllers
    let storage_lower = mb.clone(); // mb already lowercased
    let nvme_problem = storage_lower.contains("pm981") || storage_lower.contains("pm991")
        || storage_lower.contains("2200s") || storage_lower.contains("600p")
        || storage_lower.contains("970 evo") || storage_lower.contains("980 pro")
        || storage_lower.contains("990 pro") || storage_lower.contains("sn750")
        || storage_lower.contains("sn770") || storage_lower.contains("sn850");
    if nvme_problem {
        push_kext(&mut kexts, "NVMeFix.kext");
    }

    // Ethernet — select based on chipset instead of always adding both
    if architecture == "Intel" && !is_laptop {
        let eth_lower = wifi_chipset.unwrap_or("").to_lowercase();
        if eth_lower.contains("realtek") || eth_lower.contains("rtl8125") || eth_lower.contains("2.5g") {
            push_kext(&mut kexts, "LucyRTL8125Ethernet.kext");
        }
    }

    // CPUFriend for laptop power management
    if is_laptop && architecture == "Intel"
        && ["Haswell", "Broadwell", "Skylake", "Kaby Lake", "Coffee Lake", "Comet Lake", "Ice Lake"].contains(&generation)
    {
        push_kext(&mut kexts, "CPUFriend.kext");
    }

    // XHCI-unsupported for older Intel chipsets without native XHCI
    if architecture == "Intel" && !is_laptop
        && ["Haswell", "Broadwell", "Ivy Bridge", "Sandy Bridge"].contains(&generation)
    {
        push_kext(&mut kexts, "XHCI-unsupported.kext");
    }

    // OTA
    if os_ver >= 14.0 { push_kext(&mut kexts, "RestrictEvents.kext"); }

    // Broadcom
    if let Some(policy) = get_broadcom_wifi_policy(wifi_chipset, target_os) {
        for k in &policy.auto_kexts { push_kext(&mut kexts, k); }
    }

    let needs_amd_cpu_ssdt = Regex::new(r"\b(a520|b550|a620|b650|x670|x670e|b850|x870|x870e)\b").unwrap().is_match(&mb);
    let ec_usbx = if is_laptop { "SSDT-EC-USBX-LAPTOP.aml" } else { "SSDT-EC-USBX-DESKTOP.aml" };
    let ec_ssdt = if is_laptop { "SSDT-EC-LAPTOP.aml" } else { "SSDT-EC-DESKTOP.aml" };
    let plug_ssdt = "SSDT-PLUG-DRTNIA.aml";
    // SSDT-PLUG is unnecessary on macOS 12.3+ (Monterey 12.3 changed XCPM handling)
    let needs_plug = os_ver < 12.3;

    if architecture == "Intel" {
        if ["Alder Lake", "Raptor Lake"].contains(&generation) {
            if needs_plug { push_ssdt(&mut ssdts, plug_ssdt); }
            push_ssdt(&mut ssdts, "SSDT-AWAC.aml");
            push_ssdt(&mut ssdts, ec_usbx);
            if !is_laptop { push_ssdt(&mut ssdts, "SSDT-RHUB.aml"); }
            push_kext(&mut kexts, "CPUTopologyRebuild.kext");
        } else if ["Coffee Lake", "Comet Lake", "Rocket Lake"].contains(&generation) {
            if needs_plug { push_ssdt(&mut ssdts, plug_ssdt); }
            push_ssdt(&mut ssdts, "SSDT-AWAC.aml");
            push_ssdt(&mut ssdts, ec_usbx);
            if !is_laptop && (mb.contains("z390") || mb.contains("z370") || mb.contains("h370")
                || mb.contains("b360") || mb.contains("b365") || mb.contains("h310") || mb.contains("q370")) {
                push_ssdt(&mut ssdts, "SSDT-PMC.aml");
            }
            if is_laptop && generation == "Coffee Lake" { push_ssdt(&mut ssdts, "SSDT-PMC.aml"); }
            if !is_laptop && generation == "Comet Lake" && mb.contains("z490") { push_ssdt(&mut ssdts, "SSDT-RHUB.aml"); }
        } else if ["Haswell", "Broadwell"].contains(&generation) {
            if needs_plug { push_ssdt(&mut ssdts, plug_ssdt); }
            push_ssdt(&mut ssdts, ec_ssdt);
        } else if ["Skylake", "Kaby Lake", "Ice Lake"].contains(&generation) {
            if needs_plug { push_ssdt(&mut ssdts, plug_ssdt); }
            push_ssdt(&mut ssdts, ec_usbx);
            if generation == "Ice Lake" { push_ssdt(&mut ssdts, "SSDT-AWAC.aml"); }
        } else if ["Ivy Bridge-E", "Haswell-E", "Broadwell-E", "Cascade Lake-X"].contains(&generation) {
            if generation != "Ivy Bridge-E" && needs_plug { push_ssdt(&mut ssdts, plug_ssdt); }
            if generation == "Ivy Bridge-E" { push_ssdt(&mut ssdts, "SSDT-EC-DESKTOP.aml"); }
            else { push_ssdt(&mut ssdts, "SSDT-EC-USBX-DESKTOP.aml"); }
            push_ssdt(&mut ssdts, "SSDT-UNC.aml");
            if ["Haswell-E", "Broadwell-E"].contains(&generation) { push_ssdt(&mut ssdts, "SSDT-RTC0-RANGE-HEDT.aml"); }
        } else if ["Sandy Bridge", "Ivy Bridge"].contains(&generation) {
            push_ssdt(&mut ssdts, ec_ssdt);
            push_ssdt(&mut ssdts, "SSDT-IMEI.aml");
        } else {
            push_ssdt(&mut ssdts, ec_ssdt);
        }
    } else if architecture == "AMD" {
        push_ssdt(&mut ssdts, ec_usbx);
        if needs_amd_cpu_ssdt { push_ssdt(&mut ssdts, "SSDT-CPUR.aml"); }
    }

    RequiredResources { kexts, ssdts }
}

// ── BIOS Settings ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct BiosSetting {
    pub name: String,
    pub value: String,
    pub description: String,
    pub plain_title: Option<String>,
    pub bios_location: Option<String>,
    pub jargon_def: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BiosConfig {
    pub enable: Vec<BiosSetting>,
    pub disable: Vec<BiosSetting>,
}

pub fn get_bios_settings(architecture: &str, motherboard: &str) -> BiosConfig {
    let mb = motherboard.to_lowercase();

    if architecture == "AMD" {
        return BiosConfig {
            disable: vec![
                BiosSetting { name: "Fast Boot".into(), value: "Disable".into(), description: "Prevents issues with hardware initialization".into(), plain_title: Some("Fast Boot".into()), bios_location: Some("Boot > Fast Boot".into()), jargon_def: None },
                BiosSetting { name: "Secure Boot".into(), value: "Disable".into(), description: "macOS bootloader is not signed by Microsoft".into(), plain_title: Some("Secure Boot".into()), bios_location: Some("Security > Secure Boot".into()), jargon_def: None },
                BiosSetting { name: "Serial/COM Port".into(), value: "Disable".into(), description: "Can cause conflicts with macOS".into(), plain_title: None, bios_location: None, jargon_def: None },
                BiosSetting { name: "Parallel Port".into(), value: "Disable".into(), description: "Can cause conflicts with macOS".into(), plain_title: None, bios_location: None, jargon_def: None },
                BiosSetting { name: "CSM".into(), value: "Disable".into(), description: "Must be off for UEFI boot".into(), plain_title: Some("Legacy / CSM Mode".into()), bios_location: None, jargon_def: None },
                BiosSetting { name: "IOMMU".into(), value: "Disable".into(), description: "AMD I/O memory management".into(), plain_title: Some("IOMMU (AMD-Vi)".into()), bios_location: None, jargon_def: None },
            ],
            enable: vec![
                BiosSetting { name: "Above 4G Decoding".into(), value: "Enable".into(), description: "Required for 64-bit device addressing".into(), plain_title: Some("Above 4G Memory Decoding".into()), bios_location: None, jargon_def: None },
                BiosSetting { name: "EHCI/XHCI Hand-off".into(), value: "Enable".into(), description: "Lets macOS control USB controllers".into(), plain_title: Some("USB Controller Hand-off".into()), bios_location: None, jargon_def: None },
                BiosSetting { name: "OS Type: Windows 8.1/10 UEFI Mode".into(), value: "Enable".into(), description: "Some boards may need Other OS instead".into(), plain_title: None, bios_location: None, jargon_def: None },
                BiosSetting { name: "SATA Mode: AHCI".into(), value: "Enable".into(), description: "Required for macOS SATA recognition".into(), plain_title: Some("Storage Controller Mode: AHCI".into()), bios_location: None, jargon_def: None },
                BiosSetting { name: "SVM Mode".into(), value: "Enable".into(), description: "AMD Secure Virtual Machine".into(), plain_title: Some("AMD CPU Virtualisation (SVM Mode)".into()), bios_location: None, jargon_def: None },
            ],
        };
    }

    let mut config = BiosConfig {
        disable: vec![
            BiosSetting { name: "Fast Boot".into(), value: "Disable".into(), description: "Prevents issues with hardware initialization".into(), plain_title: Some("Fast Boot".into()), bios_location: None, jargon_def: None },
            BiosSetting { name: "Secure Boot".into(), value: "Disable".into(), description: "macOS bootloader is not signed".into(), plain_title: Some("Secure Boot".into()), bios_location: None, jargon_def: None },
            BiosSetting { name: "Serial/COM Port".into(), value: "Disable".into(), description: "Can cause conflicts".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "Parallel Port".into(), value: "Disable".into(), description: "Can cause conflicts".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "VT-d".into(), value: "Disable".into(), description: "Disable for the default path; keep enabled only when using a cleaned DMAR table and DisableIoMapper=NO for VT-d dependent devices.".into(), plain_title: Some("VT-d (Intel IOMMU)".into()), bios_location: None, jargon_def: None },
            BiosSetting { name: "CSM".into(), value: "Disable".into(), description: "Must be off".into(), plain_title: Some("Legacy / CSM Mode".into()), bios_location: None, jargon_def: None },
            BiosSetting { name: "Thunderbolt".into(), value: "Disable".into(), description: "Disable for initial install".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "Intel SGX".into(), value: "Disable".into(), description: "Not supported by macOS".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "Intel Platform Trust".into(), value: "Disable".into(), description: "Not needed for macOS".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "CFG Lock".into(), value: "Disable".into(), description: "MSR 0xE2 write protection — MUST be off".into(), plain_title: Some("CFG Lock".into()), bios_location: None, jargon_def: None },
        ],
        enable: vec![
            BiosSetting { name: "VT-x".into(), value: "Enable".into(), description: "Intel Virtualization Technology".into(), plain_title: Some("Intel CPU Virtualisation (VT-x)".into()), bios_location: None, jargon_def: None },
            BiosSetting { name: "Above 4G Decoding".into(), value: "Enable".into(), description: "Required for 64-bit device addressing".into(), plain_title: Some("Above 4G Memory Decoding".into()), bios_location: None, jargon_def: None },
            BiosSetting { name: "Hyper-Threading".into(), value: "Enable".into(), description: "Intel multi-threading support".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "Execute Disable Bit".into(), value: "Enable".into(), description: "Security feature needed by macOS".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "EHCI/XHCI Hand-off".into(), value: "Enable".into(), description: "Lets macOS control USB controllers".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "OS Type: Windows 8.1/10 UEFI Mode".into(), value: "Enable".into(), description: "Some boards may need Other OS".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "DVMT Pre-Allocated: 64MB+".into(), value: "Enable".into(), description: "Required for Intel iGPU framebuffer".into(), plain_title: None, bios_location: None, jargon_def: None },
            BiosSetting { name: "SATA Mode: AHCI".into(), value: "Enable".into(), description: "Required for macOS SATA recognition".into(), plain_title: None, bios_location: None, jargon_def: None },
        ],
    };

    if mb.contains("z390") || mb.contains("z490") {
        config.enable.push(BiosSetting {
            name: "ProtectUefiServices (in config.plist)".into(), value: "Enable".into(),
            description: format!("{}  requires this quirk", if mb.contains("z390") { "Z390" } else { "Z490" }),
            plain_title: None, bios_location: None, jargon_def: None,
        });
    }

    config
}

// ── Main Config.plist Generator (using quick-xml) ───────────────────────────

/// Helper to write a key-value pair inside a <dict>.
fn write_key(w: &mut Writer<Cursor<Vec<u8>>>, key: &str) {
    w.write_event(Event::Start(BytesStart::new("key"))).unwrap();
    w.write_event(Event::Text(BytesText::new(key))).unwrap();
    w.write_event(Event::End(BytesEnd::new("key"))).unwrap();
}

fn write_string(w: &mut Writer<Cursor<Vec<u8>>>, val: &str) {
    w.write_event(Event::Start(BytesStart::new("string"))).unwrap();
    w.write_event(Event::Text(BytesText::new(val))).unwrap();
    w.write_event(Event::End(BytesEnd::new("string"))).unwrap();
}

fn write_data(w: &mut Writer<Cursor<Vec<u8>>>, val: &str) {
    w.write_event(Event::Start(BytesStart::new("data"))).unwrap();
    w.write_event(Event::Text(BytesText::new(val))).unwrap();
    w.write_event(Event::End(BytesEnd::new("data"))).unwrap();
}

fn write_integer(w: &mut Writer<Cursor<Vec<u8>>>, val: i64) {
    w.write_event(Event::Start(BytesStart::new("integer"))).unwrap();
    w.write_event(Event::Text(BytesText::new(&val.to_string()))).unwrap();
    w.write_event(Event::End(BytesEnd::new("integer"))).unwrap();
}

fn write_bool(w: &mut Writer<Cursor<Vec<u8>>>, val: bool) {
    let tag = if val { "true" } else { "false" };
    w.write_event(Event::Empty(BytesStart::new(tag))).unwrap();
}

fn write_key_bool(w: &mut Writer<Cursor<Vec<u8>>>, key: &str, val: bool) {
    write_key(w, key); write_bool(w, val);
}

fn write_key_string(w: &mut Writer<Cursor<Vec<u8>>>, key: &str, val: &str) {
    write_key(w, key); write_string(w, val);
}

fn write_key_data(w: &mut Writer<Cursor<Vec<u8>>>, key: &str, val: &str) {
    write_key(w, key); write_data(w, val);
}

fn write_key_integer(w: &mut Writer<Cursor<Vec<u8>>>, key: &str, val: i64) {
    write_key(w, key); write_integer(w, val);
}

fn write_empty_array(w: &mut Writer<Cursor<Vec<u8>>>, key: &str) {
    write_key(w, key);
    w.write_event(Event::Start(BytesStart::new("array"))).unwrap();
    w.write_event(Event::End(BytesEnd::new("array"))).unwrap();
}

fn write_empty_dict(w: &mut Writer<Cursor<Vec<u8>>>, key: &str) {
    write_key(w, key);
    w.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    w.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
}

/// Generate a full OpenCore config.plist as XML string.
///
/// This is the main entry point. It ports ALL logic from `generateConfigPlist` in the TS source.
#[allow(clippy::too_many_arguments)]
pub fn generate_config_plist(
    architecture: &str,
    generation: &str,
    is_laptop: bool,
    is_vm: bool,
    motherboard: &str,
    target_os: &str,
    gpu: &str,
    gpu_devices: &Option<Vec<HardwareGpuDeviceSummary>>,
    smbios: &str,
    boot_args_input: &str,
    audio_codec: Option<&str>,
    audio_layout_id_override: Option<u32>,
    input_stack: Option<&str>,
    wifi_chipset: Option<&str>,
    strategy: &str,
    core_count: Option<u32>,
) -> Result<String, AppError> {
    info!(generation, architecture, smbios, "Generating config.plist");

    let os_ver = parse_macos_version(target_os);
    let devices = get_profile_gpu_devices(gpu, gpu_devices);

    // Tahoe check
    if os_ver >= 26.0 && architecture == "Intel" && tahoe_unsupported_generations().contains(generation) {
        return Err(AppError::new("UNSUPPORTED_GENERATION",
            format!("{} is not supported on {}.", generation, target_os)));
    }

    let quirks = get_quirks_for_generation(generation, motherboard, is_vm, strategy, target_os, is_laptop);
    let res = get_required_resources(architecture, generation, is_laptop, motherboard, target_os, gpu, gpu_devices, input_stack, wifi_chipset);
    let kexts = res.kexts;
    let ssdts = res.ssdts;

    let audio_layout_id = audio_layout_id_override.unwrap_or_else(|| resolve_audio_layout_id(audio_codec));
    let sip = get_sip_policy(architecture, generation, target_os, gpu, gpu_devices);
    let platform_identity = generate_platform_identity();

    let mut boot_args = boot_args_input.to_string();

    if strategy == "conservative" {
        if !boot_args.contains("-v") { boot_args.push_str(" -v"); }
        if !boot_args.contains("debug=0x100") { boot_args.push_str(" debug=0x100"); }
        if !boot_args.contains("keepsyms=1") { boot_args.push_str(" keepsyms=1"); }
    }

    if !boot_args.contains("alcid=") {
        boot_args.push_str(&format!(" alcid={}", audio_layout_id));
    } else {
        let re = Regex::new(r"alcid=\d+").unwrap();
        boot_args = re.replace(&boot_args, &format!("alcid={}", audio_layout_id)).to_string();
    }

    // agdpmod=pikera
    let gpu_assessments: Vec<GpuAssessment> = devices.iter().map(classify_gpu).collect();
    let smbios_needs_pikera = smbios.starts_with("iMac")
        && gpu_assessments.iter().any(|a| a.vendor == "AMD" && a.is_likely_discrete
            && (a.tier == GpuSupportTier::Supported || a.tier == GpuSupportTier::PartialSupport));
    if needs_navi_pikera(&devices) || smbios_needs_pikera {
        if !boot_args.contains("agdpmod=pikera") { boot_args.push_str(" agdpmod=pikera"); }
    }

    if has_unsupported_modern_nvidia(&devices) {
        if !boot_args.contains("-wegnoegpu") { boot_args.push_str(" -wegnoegpu"); }
    }

    // Coffee Lake+ laptop backlight
    if is_laptop && ["Coffee Lake", "Comet Lake", "Rocket Lake", "Alder Lake", "Raptor Lake"].contains(&generation) {
        if !boot_args.contains("-igfxblr") { boot_args.push_str(" -igfxblr"); }
    }

    // Ice Lake
    if generation == "Ice Lake" {
        if !boot_args.contains("-igfxcdc") { boot_args.push_str(" -igfxcdc"); }
        if !boot_args.contains("-igfxdvmt") { boot_args.push_str(" -igfxdvmt"); }
    }

    // Tahoe Intel BT
    if os_ver >= 26.0 && !boot_args.contains("-ibtcompatbeta") {
        boot_args.push_str(" -ibtcompatbeta");
    }

    // Sonoma OTA
    if os_ver >= 14.0 && !boot_args.contains("revpatch=sbvmm") {
        boot_args.push_str(" revpatch=sbvmm");
    }

    // CPUID spoofing
    let mut cpuid1_data = "AAAAAAAAAAAAAAAAAAAAAA==".to_string();
    let mut cpuid1_mask = "AAAAAAAAAAAAAAAAAAAAAA==".to_string();
    if ["Rocket Lake", "Alder Lake", "Raptor Lake"].contains(&generation) {
        cpuid1_data = "VQYKAAAAAAAAAAAAAAAAAA==".into();
        cpuid1_mask = "/////wAAAAAAAAAAAAAAAA==".into();
    }
    if generation == "Haswell-E" {
        cpuid1_data = "wwYDAAAAAAAAAAAAAAAAAA==".into();
        cpuid1_mask = "/////wAAAAAAAAAAAAAAAA==".into();
    }

    // iGPU / headless detection
    let headless_igpu = !is_laptop
        && gpu_assessments.iter().any(|a| a.is_likely_discrete && a.tier != GpuSupportTier::Unsupported);

    // ig-platform-id tables
    let laptop_ids: Vec<(&str, &str)> = vec![
        ("Sandy Bridge", "AAABAA=="), ("Ivy Bridge", "BABmAQ=="),
        ("Haswell", "BgAmCg=="), ("Broadwell", "BgAmFg=="),
        ("Skylake", "AAAWGQ=="), ("Kaby Lake", "AAAbWQ=="),
        ("Coffee Lake", "CQClPg=="), ("Comet Lake", "CQClPg=="),
        ("Ice Lake", "AABSig=="),
    ];
    let display_ids: Vec<(&str, &str)> = vec![
        ("Sandy Bridge", "EAADAA=="), ("Ivy Bridge", "CgBmAQ=="),
        ("Haswell", "AwAiDQ=="), ("Broadwell", "BwAiFg=="),
        ("Skylake", "AAASGQ=="), ("Kaby Lake", "AAASWQ=="),
        ("Coffee Lake", "BwCbPg=="), ("Comet Lake", "BwCbPg=="),
    ];
    let headless_ids: Vec<(&str, &str)> = vec![
        ("Sandy Bridge", "AAAFAA=="), ("Ivy Bridge", "BwBiAQ=="),
        ("Haswell", "BAASBA=="), ("Broadwell", "BAAmFg=="),
        ("Skylake", "AQASGQ=="), ("Kaby Lake", "AwASWQ=="),
        ("Coffee Lake", "AwCRPg=="), ("Comet Lake", "AwDImw=="),
    ];

    let find_id = |table: &[(&str, &str)], gen: &str, fallback: &str| -> String {
        table.iter().find(|&&(g, _)| g == gen).map(|&(_, id)| id).unwrap_or(fallback).to_string()
    };

    // Device-ID spoof
    let mut device_id_spoof: Option<String> = None;
    if generation == "Sandy Bridge" {
        device_id_spoof = Some(if headless_igpu { "AgEAAA==" } else { "JgEAAA==" }.into());
    }
    if generation == "Haswell" && !headless_igpu {
        device_id_spoof = Some("EgQAAA==".into());
    }
    if is_laptop && ["Coffee Lake", "Comet Lake"].contains(&generation) {
        device_id_spoof = Some("mz4AAA==".into());
    }

    // Audio device path
    let modern_audio_gens = ["Coffee Lake", "Comet Lake", "Rocket Lake", "Alder Lake", "Raptor Lake"];
    let audio_device_path = if architecture == "Intel" && modern_audio_gens.contains(&generation) {
        "PciRoot(0x0)/Pci(0x1f,0x3)"
    } else {
        "PciRoot(0x0)/Pci(0x1b,0x0)"
    };

    // Layout-id as base64
    let layout_bytes = [(audio_layout_id & 0xFF) as u8, ((audio_layout_id >> 8) & 0xFF) as u8, 0, 0];
    let layout_id_base64 = BASE64.encode(layout_bytes);

    // AMD patches
    let kernel_patches = if architecture == "AMD" {
        let cc = core_count.ok_or_else(|| AppError::new("AMD_CORE_COUNT",
            format!("AMD build requires a detected core count — got {:?}", core_count)))?;
        get_amd_patches(cc)
    } else {
        vec![]
    };

    // Legacy NVRAM
    let mb = motherboard.to_lowercase();
    let needs_legacy_nvram = mb.contains("z390") || mb.contains("z370") || mb.contains("h370")
        || mb.contains("b360") || mb.contains("b365") || mb.contains("h310") || mb.contains("q370");

    // ACPI Delete entries for Sandy/Ivy Bridge
    let needs_acpi_delete = ["Sandy Bridge", "Ivy Bridge"].contains(&generation);

    // ── Build XML with quick-xml ────────────────────────────────────────────
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b'\t', 1);

    writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None))).unwrap();
    // DOCTYPE
    writer.get_mut().get_mut().extend_from_slice(
        b"\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
    );

    let mut plist = BytesStart::new("plist");
    plist.push_attribute(("version", "1.0"));
    writer.write_event(Event::Start(plist)).unwrap();

    // Root dict
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();

    // ── ACPI ────────────────────────────────────────────────────────────────
    write_key(&mut writer, "ACPI");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        write_key(&mut writer, "Add");
        writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
        for ssdt in &ssdts {
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_string(&mut writer, "Comment", ssdt);
            write_key_bool(&mut writer, "Enabled", true);
            write_key_string(&mut writer, "Path", ssdt);
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();

        write_key(&mut writer, "Delete");
        writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
        if needs_acpi_delete {
            // Delete CpuPm
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_bool(&mut writer, "All", true);
            write_key_string(&mut writer, "Comment", "Delete CpuPm");
            write_key_bool(&mut writer, "Enabled", true);
            write_key_data(&mut writer, "OemTableId", "Q3B1UG0AAAA=");
            write_key_integer(&mut writer, "TableLength", 0);
            write_key_data(&mut writer, "TableSignature", "U1NEVA==");
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
            // Delete Cpu0Ist
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_bool(&mut writer, "All", true);
            write_key_string(&mut writer, "Comment", "Delete Cpu0Ist");
            write_key_bool(&mut writer, "Enabled", true);
            write_key_data(&mut writer, "OemTableId", "Q3B1MElzdAA=");
            write_key_integer(&mut writer, "TableLength", 0);
            write_key_data(&mut writer, "TableSignature", "U1NEVA==");
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();

        write_empty_array(&mut writer, "Patch");

        write_key(&mut writer, "Quirks");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "FadtEnableReset", false);
        write_key_bool(&mut writer, "NormalizeHeaders", false);
        write_key_bool(&mut writer, "RebaseRegions", false);
        write_key_bool(&mut writer, "ResetHwSig", false);
        write_key_bool(&mut writer, "ResetLogoStatus", true);
        write_key_bool(&mut writer, "SyncTableIds", false);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // ── Booter ──────────────────────────────────────────────────────────────
    write_key(&mut writer, "Booter");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        write_empty_array(&mut writer, "MmioWhitelist");
        write_empty_array(&mut writer, "Patch");
        write_key(&mut writer, "Quirks");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "AllowRelocationBlock", false);
        write_key_bool(&mut writer, "AvoidRuntimeDefrag", quirks.avoid_runtime_defrag);
        write_key_bool(&mut writer, "DevirtualiseMmio", quirks.devirtualise_mmio);
        write_key_bool(&mut writer, "DisableSingleUser", false);
        write_key_bool(&mut writer, "DisableVariableWrite", false);
        write_key_bool(&mut writer, "DiscardHibernateMap", false);
        write_key_bool(&mut writer, "EnableSafeModeSlide", quirks.enable_safe_mode_slide);
        write_key_bool(&mut writer, "EnableWriteUnprotector", quirks.enable_write_unprotector);
        write_key_bool(&mut writer, "ForceBooterSignature", false);
        write_key_bool(&mut writer, "ForceExitBootServices", false);
        write_key_bool(&mut writer, "ProtectMemoryRegions", quirks.protect_memory_regions);
        write_key_bool(&mut writer, "ProtectSecureBoot", false);
        write_key_bool(&mut writer, "ProtectUefiServices", quirks.protect_uefi_services);
        write_key_bool(&mut writer, "ProvideCustomSlide", quirks.provide_custom_slide);
        write_key_integer(&mut writer, "ProvideMaxSlide", 0);
        write_key_bool(&mut writer, "RebuildAppleMemoryMap", quirks.rebuild_apple_memory_map);
        write_key_integer(&mut writer, "ResizeAppleGpuBars", -1);
        write_key_bool(&mut writer, "SetupVirtualMap", quirks.setup_virtual_map);
        write_key_bool(&mut writer, "SignalAppleOS", false);
        write_key_bool(&mut writer, "SyncRuntimePermissions", quirks.sync_runtime_permissions);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // ── DeviceProperties ────────────────────────────────────────────────────
    write_key(&mut writer, "DeviceProperties");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        write_key(&mut writer, "Add");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        {
            // Audio
            write_key(&mut writer, audio_device_path);
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_data(&mut writer, "layout-id", &layout_id_base64);
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

            // GPU properties
            if architecture == "Intel" && !["Alder Lake", "Raptor Lake", "Rocket Lake"].contains(&generation) {
                let platform_id = if is_laptop {
                    find_id(&laptop_ids, generation, "CQClPg==")
                } else if headless_igpu {
                    find_id(&headless_ids, generation, "AwCRPg==")
                } else {
                    find_id(&display_ids, generation, "BwCbPg==")
                };

                let needs_fb_patches = is_laptop || !headless_igpu;

                write_key(&mut writer, "PciRoot(0x0)/Pci(0x2,0x0)");
                writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
                write_key_data(&mut writer, "AAPL,ig-platform-id", &platform_id);
                if let Some(ref did) = device_id_spoof {
                    write_key_data(&mut writer, "device-id", did);
                }
                if needs_fb_patches {
                    write_key_data(&mut writer, "framebuffer-patch-enable", "AQAAAA==");
                    write_key_data(&mut writer, "framebuffer-stolenmem", "AAAwAQ==");
                }
                writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
            }
        }
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        write_empty_dict(&mut writer, "Delete");
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // ── Kernel ──────────────────────────────────────────────────────────────
    write_key(&mut writer, "Kernel");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        // Add (kexts)
        write_key(&mut writer, "Add");
        writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
        for kext in &kexts {
            let bundle = resolve_kext_bundle_path(kext);
            let exec = resolve_kext_executable_path(kext);
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_string(&mut writer, "Arch", "Any");
            write_key_string(&mut writer, "BundlePath", &bundle);
            write_key_string(&mut writer, "Comment", kext);
            write_key_bool(&mut writer, "Enabled", true);
            write_key_string(&mut writer, "ExecutablePath", &exec);
            write_key_string(&mut writer, "MaxKernel", "");
            write_key_string(&mut writer, "MinKernel", "");
            write_key_string(&mut writer, "PlistPath", "Contents/Info.plist");
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();

        write_empty_array(&mut writer, "Block");

        // Emulate
        write_key(&mut writer, "Emulate");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_data(&mut writer, "Cpuid1Data", &cpuid1_data);
        write_key_data(&mut writer, "Cpuid1Mask", &cpuid1_mask);
        write_key_bool(&mut writer, "DummyPowerManagement", architecture == "AMD");
        write_key_string(&mut writer, "MaxKernel", "");
        write_key_string(&mut writer, "MinKernel", "");
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_empty_array(&mut writer, "Force");

        // Patch (AMD kernel patches)
        write_key(&mut writer, "Patch");
        writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
        for p in &kernel_patches {
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_string(&mut writer, "Arch", &p.arch);
            write_key_string(&mut writer, "Base", &p.base);
            write_key_string(&mut writer, "Comment", &p.comment);
            write_key_integer(&mut writer, "Count", p.count as i64);
            write_key_bool(&mut writer, "Enabled", p.enabled);
            write_key_data(&mut writer, "Find", &p.find);
            write_key_string(&mut writer, "Identifier", &p.identifier);
            write_key_integer(&mut writer, "Limit", p.limit as i64);
            write_key_data(&mut writer, "Mask", &p.mask);
            write_key_string(&mut writer, "MaxKernel", &p.max_kernel);
            write_key_string(&mut writer, "MinKernel", &p.min_kernel);
            write_key_data(&mut writer, "Replace", &p.replace);
            write_key_data(&mut writer, "ReplaceMask", &p.replace_mask);
            write_key_integer(&mut writer, "Skip", p.skip as i64);
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();

        // Kernel Quirks
        write_key(&mut writer, "Quirks");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "AppleCpuPmCfgLock", quirks.apple_cpu_pm_cfg_lock);
        write_key_bool(&mut writer, "AppleXcpmCfgLock", quirks.apple_xcpm_cfg_lock);
        write_key_bool(&mut writer, "AppleXcpmExtraMsrs", quirks.apple_xcpm_extra_msrs);
        write_key_bool(&mut writer, "AppleXcpmForceBoost", false);
        write_key_bool(&mut writer, "CustomSMBIOSGuid", false);
        write_key_bool(&mut writer, "DisableIoMapper", quirks.disable_io_mapper);
        write_key_bool(&mut writer, "DisableLinkeditJettison", true);
        write_key_bool(&mut writer, "DisableRtcChecksum", quirks.disable_rtc_checksum);
        write_key_bool(&mut writer, "FixupAppleEfiImages", quirks.fixup_apple_efi_images);
        write_key_bool(&mut writer, "ExtendBTFeatureFlags", false);
        write_key_bool(&mut writer, "ExternalDiskIcons", false);
        write_key_bool(&mut writer, "ForceSecureBootScheme", false);
        write_key_bool(&mut writer, "IncreasePciBarSize", false);
        write_key_bool(&mut writer, "LapicKernelPanic", false);
        write_key_bool(&mut writer, "LegacyCommpage", false);
        write_key_bool(&mut writer, "PanicNoKextDump", quirks.panic_no_kext_dump);
        write_key_bool(&mut writer, "PowerTimeoutKernelPanic", quirks.power_timeout_kernel_panic);
        write_key_bool(&mut writer, "ProvideCurrentCpuInfo", quirks.provide_current_cpu_info);
        write_key_integer(&mut writer, "SetApfsTrimTimeout", -1);
        write_key_bool(&mut writer, "ThirdPartyDrives", false);
        write_key_bool(&mut writer, "XhciPortLimit", quirks.xhci_port_limit);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        // Scheme
        write_key(&mut writer, "Scheme");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "CustomKernel", false);
        write_key_bool(&mut writer, "FuzzyMatch", true);
        write_key_string(&mut writer, "KernelArch", "Auto");
        write_key_string(&mut writer, "KernelCache", "Auto");
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // ── Misc ────────────────────────────────────────────────────────────────
    write_key(&mut writer, "Misc");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        write_empty_array(&mut writer, "BlessOverride");

        write_key(&mut writer, "Boot");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_integer(&mut writer, "ConsoleAttributes", 0);
        write_key_string(&mut writer, "HibernateMode", "None");
        write_key_bool(&mut writer, "HideAuxiliary", false);
        write_key_string(&mut writer, "LauncherOption", "Disabled");
        write_key_string(&mut writer, "LauncherPath", "Default");
        write_key_integer(&mut writer, "PickerAttributes", 17);
        write_key_bool(&mut writer, "PickerAudioAssist", false);
        write_key_string(&mut writer, "PickerMode", "External");
        write_key_string(&mut writer, "PickerVariant", "Acidanthera\\GoldenGate");
        write_key_bool(&mut writer, "PollAppleHotKeys", false);
        write_key_bool(&mut writer, "ShowPicker", true);
        write_key_integer(&mut writer, "TakeoffDelay", 0);
        write_key_integer(&mut writer, "Timeout", 5);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_key(&mut writer, "Debug");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "AppleDebug", true);
        write_key_bool(&mut writer, "ApplePanic", true);
        write_key_bool(&mut writer, "DisableWatchDog", true);
        write_key_integer(&mut writer, "DisplayDelay", 0);
        write_key_integer(&mut writer, "DisplayLevel", 2147483650);
        write_key_string(&mut writer, "LogModules", "*");
        write_key_bool(&mut writer, "SysReport", false);
        write_key_integer(&mut writer, "Target", if strategy == "conservative" { 67 } else { 3 });
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_empty_array(&mut writer, "Entries");

        write_key(&mut writer, "Security");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "AllowNvramReset", true);
        write_key_bool(&mut writer, "AllowSetDefault", true);
        write_key_bool(&mut writer, "AllowToggleSip", false);
        write_key_integer(&mut writer, "ApECID", 0);
        write_key_bool(&mut writer, "AuthRestart", false);
        write_key_bool(&mut writer, "BlacklistAppleUpdate", true);
        write_key_string(&mut writer, "DmgLoading", "Signed");
        write_key_bool(&mut writer, "EnablePassword", false);
        write_key_integer(&mut writer, "ExposeSensitiveData", 6);
        write_key_integer(&mut writer, "HaltLevel", 2147483648);
        write_key_data(&mut writer, "PasswordHash", "");
        write_key_data(&mut writer, "PasswordSalt", "");
        write_key_integer(&mut writer, "ScanPolicy", 0);
        write_key_string(&mut writer, "SecureBootModel", "Disabled");
        write_key_string(&mut writer, "Vault", "Optional");
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_key(&mut writer, "Tools");
        writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_string(&mut writer, "Arguments", "");
        write_key_bool(&mut writer, "Auxiliary", true);
        write_key_string(&mut writer, "Comment", "OpenShell.efi");
        write_key_bool(&mut writer, "Enabled", true);
        write_key_string(&mut writer, "Flavour", "OpenShell:UEFIShell:Shell");
        write_key_string(&mut writer, "Name", "OpenShell.efi");
        write_key_string(&mut writer, "Path", "OpenShell.efi");
        write_key_bool(&mut writer, "RealPath", false);
        write_key_bool(&mut writer, "TextMode", false);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // ── NVRAM ───────────────────────────────────────────────────────────────
    write_key(&mut writer, "NVRAM");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        write_key(&mut writer, "Add");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        {
            write_key(&mut writer, "4D1EDE05-38C7-4A6A-9CC6-4BCCA8B38C14");
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_data(&mut writer, "DefaultBackgroundColor", "AAAAAA==");
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

            write_key(&mut writer, "4D1FDA02-38C7-4A6A-9CC6-4BCCA8B30102");
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_data(&mut writer, "rtc-blacklist", "");
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

            write_key(&mut writer, "7C436110-AB2A-4BBB-A880-FE41995C9F82");
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_integer(&mut writer, "ForceDisplayRotationInEFI", 0);
            write_key_data(&mut writer, "SystemAudioVolume", "Rg==");
            write_key_string(&mut writer, "boot-args", boot_args.trim());
            write_key_data(&mut writer, "csr-active-config", &sip.value);
            write_key_string(&mut writer, "prev-lang:kbd", "en-US:0");
            write_key_string(&mut writer, "run-efi-updater", "No");
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_key(&mut writer, "Delete");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        {
            write_key(&mut writer, "4D1EDE05-38C7-4A6A-9CC6-4BCCA8B38C14");
            writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
            write_string(&mut writer, "DefaultBackgroundColor");
            writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();

            write_key(&mut writer, "4D1FDA02-38C7-4A6A-9CC6-4BCCA8B30102");
            writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
            write_string(&mut writer, "rtc-blacklist");
            writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();

            write_key(&mut writer, "7C436110-AB2A-4BBB-A880-FE41995C9F82");
            writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
            write_string(&mut writer, "boot-args");
            write_string(&mut writer, "csr-active-config");
            writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_key_bool(&mut writer, "LegacyEnable", needs_legacy_nvram);
        write_key_bool(&mut writer, "LegacyOverwrite", needs_legacy_nvram);
        write_empty_dict(&mut writer, "LegacySchema");
        write_key_bool(&mut writer, "WriteFlash", true);
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // ── PlatformInfo ────────────────────────────────────────────────────────
    write_key(&mut writer, "PlatformInfo");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        write_key_bool(&mut writer, "Automatic", true);
        write_key_bool(&mut writer, "CustomMemory", false);

        write_key(&mut writer, "Generic");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "AdviseFeatures", false);
        write_key_bool(&mut writer, "MaxBIOSVersion", false);
        write_key_string(&mut writer, "MLB", &platform_identity.mlb);
        write_key_integer(&mut writer, "ProcessorType", 0);
        write_key_data(&mut writer, "ROM", &platform_identity.rom);
        write_key_bool(&mut writer, "SpoofVendor", true);
        write_key_string(&mut writer, "SystemMemoryStatus", "Auto");
        write_key_string(&mut writer, "SystemProductName", smbios);
        write_key_string(&mut writer, "SystemSerialNumber", &platform_identity.serial);
        write_key_string(&mut writer, "SystemUUID", &platform_identity.system_uuid);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_key_bool(&mut writer, "UpdateDataHub", true);
        write_key_bool(&mut writer, "UpdateNVRAM", true);
        write_key_bool(&mut writer, "UpdateSMBIOS", true);
        write_key_string(&mut writer, "UpdateSMBIOSMode",
            if smbios == "MacPro7,1" { "Custom" } else { "Create" });
        write_key_bool(&mut writer, "UseRawUuidEncoding", false);
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // ── UEFI ────────────────────────────────────────────────────────────────
    write_key(&mut writer, "UEFI");
    writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
    {
        // APFS
        write_key(&mut writer, "APFS");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "EnableJumpstart", true);
        write_key_bool(&mut writer, "GlobalConnect", false);
        write_key_bool(&mut writer, "HideVerbose", true);
        write_key_bool(&mut writer, "JumpstartHotPlug", false);
        write_key_integer(&mut writer, "MinDate", if os_ver < 10.15 { -1 } else { 0 });
        write_key_integer(&mut writer, "MinVersion", if os_ver < 10.15 { -1 } else { 0 });
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        // AppleInput
        write_key(&mut writer, "AppleInput");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_string(&mut writer, "AppleEvent", "Builtin");
        write_key_bool(&mut writer, "CustomDelays", false);
        write_key_bool(&mut writer, "GraphicsInputMirroring", true);
        write_key_integer(&mut writer, "KeyInitialDelay", 50);
        write_key_integer(&mut writer, "KeySubsequentDelay", 5);
        write_key_integer(&mut writer, "PointerPollMask", -1);
        write_key_integer(&mut writer, "PointerPollMin", 10);
        write_key_integer(&mut writer, "PointerPollMax", 80);
        write_key_integer(&mut writer, "PointerSpeedDiv", 1);
        write_key_integer(&mut writer, "PointerSpeedMul", 1);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        // Audio
        write_key(&mut writer, "Audio");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_integer(&mut writer, "AudioCodec", 0);
        write_key_string(&mut writer, "AudioDevice", audio_device_path);
        write_key_integer(&mut writer, "AudioOutMask", 1);
        write_key_bool(&mut writer, "AudioSupport", false);
        write_key_bool(&mut writer, "DisconnectHda", false);
        write_key_integer(&mut writer, "MaximumGain", -15);
        write_key_integer(&mut writer, "MinimumAssistGain", -30);
        write_key_integer(&mut writer, "MinimumAudibleGain", -55);
        write_key_string(&mut writer, "PlayChime", "Auto");
        write_key_bool(&mut writer, "ResetTrafficClass", false);
        write_key_integer(&mut writer, "SetupDelay", 0);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_key_bool(&mut writer, "ConnectDrivers", true);

        // Drivers
        write_key(&mut writer, "Drivers");
        writer.write_event(Event::Start(BytesStart::new("array"))).unwrap();
        for (path, comment) in [("OpenHfsPlus.efi", "HFS+ Driver"), ("OpenRuntime.efi", ""), ("OpenCanopy.efi", "")] {
            writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
            write_key_string(&mut writer, "Arguments", "");
            write_key_string(&mut writer, "Comment", comment);
            write_key_bool(&mut writer, "Enabled", true);
            write_key_string(&mut writer, "Path", path);
            writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("array"))).unwrap();

        // Input
        write_key(&mut writer, "Input");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "KeyFiltering", false);
        write_key_integer(&mut writer, "KeyForgetThreshold", 5);
        write_key_bool(&mut writer, "KeySupport", true);
        write_key_string(&mut writer, "KeySupportMode", "Auto");
        write_key_bool(&mut writer, "KeySwap", false);
        write_key_bool(&mut writer, "PointerSupport", false);
        write_key_string(&mut writer, "PointerSupportMode", "ASUS");
        write_key_integer(&mut writer, "TimerResolution", 50000);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        // Output
        write_key(&mut writer, "Output");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "ClearScreenOnModeSwitch", false);
        write_key_string(&mut writer, "ConsoleMode", "");
        write_key_bool(&mut writer, "DirectGopRendering", false);
        write_key_bool(&mut writer, "ForceResolution", false);
        write_key_string(&mut writer, "GopPassThrough", "Disabled");
        write_key_bool(&mut writer, "IgnoreTextInGraphics", false);
        write_key_bool(&mut writer, "ProvideConsoleGop", true);
        write_key_bool(&mut writer, "ReconnectGraphicsOnConnect", false);
        write_key_bool(&mut writer, "ReconnectOnResChange", false);
        write_key_bool(&mut writer, "ReplaceTabWithSpace", false);
        write_key_string(&mut writer, "Resolution", "Max");
        write_key_bool(&mut writer, "SanitiseClearScreen", false);
        write_key_string(&mut writer, "TextRenderer", "BuiltinGraphics");
        write_key_bool(&mut writer, "UgaPassThrough", false);
        write_key_integer(&mut writer, "UIScale", 0);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        // ProtocolOverrides
        write_key(&mut writer, "ProtocolOverrides");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        for key in ["AppleAudio", "AppleBootPolicy", "AppleDebugLog", "AppleEg2Info",
            "AppleFramebufferInfo", "AppleImageConversion", "AppleImg4Verification",
            "AppleKeyMap", "AppleRtcRam", "AppleSecureBoot", "AppleSmcIo",
            "AppleUserInterfaceTheme", "DataHub", "DeviceProperties"] {
            write_key_bool(&mut writer, key, false);
        }
        write_key_bool(&mut writer, "FirmwareVolume", true);
        for key in ["HashServices", "OSInfo", "UnicodeCollation"] {
            write_key_bool(&mut writer, key, false);
        }
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        // UEFI Quirks
        write_key(&mut writer, "Quirks");
        writer.write_event(Event::Start(BytesStart::new("dict"))).unwrap();
        write_key_bool(&mut writer, "ActivateHpetSupport", false);
        write_key_bool(&mut writer, "DisableSecurityPolicy", false);
        write_key_bool(&mut writer, "EnableVectorAcceleration", true);
        write_key_integer(&mut writer, "ExitBootServicesDelay", 0);
        write_key_bool(&mut writer, "ForceOcWriteFlash", false);
        write_key_bool(&mut writer, "ForgeUefiSupport", false);
        write_key_bool(&mut writer, "IgnoreInvalidFlexRatio", quirks.ignore_invalid_flex_ratio);
        write_key_bool(&mut writer, "ReleaseUsbOwnership", quirks.release_usb_ownership);
        write_key_bool(&mut writer, "ReloadOptionRoms", false);
        write_key_bool(&mut writer, "RequestBootVarRouting", quirks.request_boot_var_routing);
        write_key_integer(&mut writer, "ResizeGpuBars", -1);
        write_key_integer(&mut writer, "TscSyncTimeout", 0);
        write_key_bool(&mut writer, "UnblockFsConnect", quirks.unblock_fs_connect);
        writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

        write_empty_array(&mut writer, "ReservedMemory");
    }
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();

    // Close root dict and plist
    writer.write_event(Event::End(BytesEnd::new("dict"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("plist"))).unwrap();

    let result = writer.into_inner().into_inner();
    let xml = String::from_utf8(result).map_err(|e| AppError::new("XML_ERROR", e.to_string()))?;

    info!("config.plist generated successfully ({} bytes)", xml.len());
    Ok(xml)
}
