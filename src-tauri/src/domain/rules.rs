//! Hackintosh rules — GPU classification, macOS version parsing, and GPU support assessment.
//! Ported from electron/hackintoshRules.ts

use regex::Regex;
use serde::{Deserialize, Serialize};

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareGpuDeviceSummary {
    pub name: String,
    pub vendor_name: Option<String>,
    pub vendor_id: Option<String>,
    pub device_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GpuSupportTier {
    Supported,
    SupportedWithLimit,
    PartialSupport,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuAssessment {
    pub name: String,
    pub vendor: String,
    pub tier: GpuSupportTier,
    pub max_macos_version: Option<f64>,
    pub notes: Vec<String>,
    pub requires_disable: bool,
    pub requires_pikera: bool,
    pub requires_noot_rx: bool,
    pub requires_nooted_red: bool,
    pub is_likely_discrete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacOSVersionOption {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub numeric: f64,
}

pub static MACOS_VERSIONS: &[(&str, &str, &str, f64)] = &[
    ("26",    "macOS Tahoe 26",          "tahoe",       26.0),
    ("15",    "macOS Sequoia 15",        "sequoia",     15.0),
    ("14",    "macOS Sonoma 14",         "sonoma",      14.0),
    ("13",    "macOS Ventura 13",        "ventura",     13.0),
    ("12",    "macOS Monterey 12",       "monterey",    12.0),
    ("11",    "macOS Big Sur 11",        "big-sur",     11.0),
    ("10.15", "macOS Catalina 10.15",    "catalina",    10.15),
    ("10.14", "macOS Mojave 10.14",      "mojave",      10.14),
    ("10.13", "macOS High Sierra 10.13", "high-sierra", 10.13),
];

pub fn parse_macos_version(os: &str) -> f64 {
    let lower = os.to_lowercase();
    let aliases: &[(&str, f64)] = &[
        ("high sierra", 10.13), ("mojave", 10.14), ("catalina", 10.15),
        ("big sur", 11.0), ("monterey", 12.0), ("ventura", 13.0),
        ("sonoma", 14.0), ("sequoia", 15.0), ("tahoe", 26.0),
    ];
    for &(label, numeric) in aliases {
        if lower.contains(label) { return numeric; }
    }
    let re = Regex::new(r"(\d+(?:\.\d+)?)").unwrap();
    if let Some(caps) = re.captures(&lower) {
        if let Ok(v) = caps[1].parse::<f64>() { return v; }
    }
    15.0
}

pub fn get_eligible_macos_versions(max_version: f64) -> Vec<MacOSVersionOption> {
    MACOS_VERSIONS.iter()
        .filter(|&&(_, _, _, n)| n <= max_version)
        .map(|&(id, name, icon, numeric)| MacOSVersionOption {
            id: id.into(), name: name.into(), icon: icon.into(), numeric,
        })
        .collect()
}

fn resolve_gpu_vendor(name: &str, vendor_hint: Option<&str>) -> String {
    let normalized = format!("{} {}", vendor_hint.unwrap_or(""), name).to_lowercase();
    if normalized.contains("nvidia") || normalized.contains("geforce") || normalized.contains("quadro")
        || normalized.contains("rtx") || normalized.contains("gtx") { return "NVIDIA".into(); }
    if normalized.contains("amd") || normalized.contains("radeon") || normalized.contains(" rx ")
        || normalized.contains("vega") || normalized.contains("firepro") || normalized.contains("navi") { return "AMD".into(); }
    if normalized.contains("intel") || normalized.contains("iris") || normalized.contains("uhd")
        || normalized.contains("hd graphics") || normalized.contains("arc") { return "Intel".into(); }
    "Unknown".into()
}

fn assessment(
    name: &str, vendor: &str, tier: GpuSupportTier, max_ver: Option<f64>,
    notes: Vec<String>,
    requires_disable: bool, requires_pikera: bool,
    requires_noot_rx: bool, requires_nooted_red: bool,
    is_likely_discrete: Option<bool>,
) -> GpuAssessment {
    GpuAssessment {
        name: name.into(), vendor: vendor.into(), tier, max_macos_version: max_ver,
        notes, requires_disable, requires_pikera, requires_noot_rx, requires_nooted_red,
        is_likely_discrete: is_likely_discrete.unwrap_or(vendor != "Intel"),
    }
}

pub fn classify_gpu(device: &HardwareGpuDeviceSummary) -> GpuAssessment {
    let name = if device.name.trim().is_empty() { "Unknown GPU" } else { device.name.trim() };
    let lower = name.to_lowercase();
    let vendor = resolve_gpu_vendor(name, device.vendor_name.as_deref());

    // Software/remote display adapter
    let is_software = lower.contains("microsoft remote display adapter")
        || lower.contains("remote display adapter")
        || lower.contains("basic display adapter")
        || lower.contains("render only")
        || lower.contains("indirect display");
    let vendor_id_lower = device.vendor_id.as_deref().unwrap_or("").to_lowercase();
    let has_real_gpu_vendor_id = vendor_id_lower == "8086" || vendor_id_lower == "10de" || vendor_id_lower == "1002";

    if is_software && !has_real_gpu_vendor_id && vendor == "Unknown" {
        return assessment(name, "Unknown", GpuSupportTier::Unsupported, None,
            vec!["This is a software or remote display adapter, not a physical GPU. It is safely ignored.".into()],
            false, false, false, false, Some(false));
    }

    if vendor == "NVIDIA" {
        let re_modern = Regex::new(r"\b(?:20|30|40)\d{2}\b").unwrap();
        if lower.contains("rtx") || lower.contains("1650") || lower.contains("1660")
            || lower.contains("turing") || lower.contains("ampere") || lower.contains("ada")
            || re_modern.is_match(&lower)
        {
            return assessment(name, &vendor, GpuSupportTier::Unsupported, None,
                vec!["Modern NVIDIA architectures do not have macOS drivers.".into()],
                true, false, false, false, None);
        }
        let re_maxwell = Regex::new(r"\b(?:750 ti|950|960|970|980|1050|1060|1070|1080)\b").unwrap();
        if lower.contains("maxwell") || lower.contains("pascal") || re_maxwell.is_match(&lower) {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(10.13),
                vec!["Maxwell/Pascal require NVIDIA Web Drivers and are limited to High Sierra.".into()],
                false, false, false, false, None);
        }
        let re_kepler = Regex::new(r"\b(?:710|720|730|740|760|770|780)\b").unwrap();
        if lower.contains("kepler") || re_kepler.is_match(&lower) || lower.contains("quadro k") {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(11.0),
                vec!["Kepler is capped at Big Sur natively. Can be patched with OCLP for newer macOS.".into()],
                false, false, false, false, None);
        }
        let re_fermi = Regex::new(r"\b(?:2[0-9]0|3[0-9]0|4[0-9]0|5[0-9]0|6[1-4]0)\b").unwrap();
        if lower.contains("fermi") || lower.contains("tesla") || re_fermi.is_match(&lower) {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(10.13),
                vec!["Tesla/Fermi require NVIDIA Web Drivers or older macOS and are capped at High Sierra.".into()],
                false, false, false, false, None);
        }
        return assessment(name, &vendor, GpuSupportTier::Unknown, None,
            vec!["NVIDIA GPU detected but the exact macOS support ceiling could not be classified from the model string.".into()],
            false, false, false, false, None);
    }

    if vendor == "Intel" {
        let re_low_end = Regex::new(r"\b(?:uhd|hd)(?:\s+graphics)?\s*(?:510|610|600|605)\b").unwrap();
        if lower.contains("arc") || lower.contains("iris xe") || lower.contains(" xe ")
            || lower.contains("ice lake g1") || lower.contains("uhd 710") || lower.contains("uhd 730")
            || lower.contains("uhd 750") || lower.contains("uhd 770") || re_low_end.is_match(&lower)
            || lower.contains("hd 2500")
        {
            return assessment(name, &vendor, GpuSupportTier::Unsupported, None,
                vec!["This Intel graphics class is not supported by macOS (11th Gen+ or low-end Pentiums).".into()],
                false, false, false, false, Some(false));
        }
        if lower.contains("hd 4000") || lower.contains("hd graphics 4000") {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(11.0),
                vec!["HD 4000 is capped at Big Sur natively. OCLP can be used for newer versions.".into()],
                false, false, false, false, Some(false));
        }
        if lower.contains("hd 2000") || lower.contains("hd 3000") || lower.contains("hd graphics 2000")
            || lower.contains("hd graphics 3000") || lower.contains("gma hd")
            || lower.contains("arrandale") || lower.contains("clarkdale")
        {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(10.13),
                vec!["Intel 1st/2nd Gen Core iGPUs are natively capped at High Sierra. Patching via OCLP is possible but very risky.".into()],
                false, false, false, false, Some(false));
        }
        if lower.contains("hd graphics 4400") || lower.contains("hd graphics 4600")
            || lower.contains("hd graphics 5000") || lower.contains("hd graphics 5500")
            || lower.contains("hd graphics 6000") || lower.contains("hd 4400")
            || lower.contains("hd 4600") || lower.contains("hd 5000") || lower.contains("hd 5300")
            || lower.contains("hd 5500") || lower.contains("hd 6000") || lower.contains("iris 5100")
            || lower.contains("iris 6100") || lower.contains("iris 6200") || lower.contains("iris pro")
        {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(12.0),
                vec!["This older Intel iGPU generation should be capped at Monterey for deterministic automation, but OCLP can extend it.".into()],
                false, false, false, false, Some(false));
        }
        if lower.contains("hd 520") || lower.contains("hd 530") || lower.contains("uhd 620")
            || lower.contains("uhd 630") || lower.contains("iris 540") || lower.contains("iris 550")
            || lower.contains("iris plus") || lower.contains("ice lake g4") || lower.contains("ice lake g7")
            || lower.contains("uhd")
        {
            return assessment(name, &vendor, GpuSupportTier::Supported, Some(26.0), vec![],
                false, false, false, false, Some(false));
        }
        return assessment(name, &vendor, GpuSupportTier::Unknown, None,
            vec!["Intel graphics detected but the exact support ceiling needs manual verification.".into()],
            false, false, false, false, Some(false));
    }

    if vendor == "AMD" {
        if lower.contains("rx 7600") || lower.contains("rx 7700") || lower.contains("rx 7800")
            || lower.contains("rx 7900") || lower.contains("w7500") || lower.contains("w7600")
            || lower.contains("w7700") || lower.contains("w7800") || lower.contains("w7900")
            || lower.contains("navi 3")
        {
            return assessment(name, &vendor, GpuSupportTier::Unsupported, None,
                vec!["RDNA 3 / Navi 3x remains unsupported in macOS.".into()],
                false, false, false, false, None);
        }
        if lower.contains("rx 6300") || lower.contains("rx 6400") || lower.contains("rx 6500")
            || lower.contains("w6300") || lower.contains("w6400") || lower.contains("navi 24")
        {
            return assessment(name, &vendor, GpuSupportTier::Unsupported, None,
                vec!["Navi 24 remains unsupported in macOS.".into()],
                false, false, false, false, None);
        }
        if lower.contains("rx 6700") || lower.contains("rx 6750") || lower.contains("6750 gre")
            || lower.contains("navi 22")
        {
            return assessment(name, &vendor, GpuSupportTier::PartialSupport, Some(15.0),
                vec!["Navi 22 requires NootRX and is not a native WhateverGreen path.".into()],
                false, false, true, false, None);
        }

        let re_navi_pikera = Regex::new(r"rx (?:5500|5600|5700|6600|6650|6800|6900|6950)|w5500|w5700|w6600|w6800").unwrap();
        let re_vega_num = Regex::new(r"vega \d{1,2}\b").unwrap();
        let is_polaris_or_navi = lower.contains("rx 5500") || lower.contains("rx 5600")
            || lower.contains("rx 5700") || lower.contains("rx 6600") || lower.contains("rx 6650")
            || lower.contains("rx 6950") || lower.contains("rx 6800") || lower.contains("rx 6900")
            || lower.contains("radeon vii") || lower.contains("w5500") || lower.contains("w5700")
            || lower.contains("w6600") || lower.contains("w6800")
            || (lower.contains("vega") && !re_vega_num.is_match(&lower) && !lower.contains("radeon(tm) graphics"))
            || lower.contains("polaris")
            || lower.contains("rx 460") || lower.contains("rx 470") || lower.contains("rx 480")
            || lower.contains("rx 550") || lower.contains("rx 560") || lower.contains("rx 570")
            || lower.contains("rx 580") || lower.contains("rx 590")
            || lower.contains("lexa") || lower.contains("baffin") || lower.contains("ellesmere");

        if is_polaris_or_navi {
            let needs_pikera = re_navi_pikera.is_match(&lower);
            return assessment(name, &vendor, GpuSupportTier::Supported, Some(26.0), vec![],
                false, needs_pikera, false, false, None);
        }

        if lower.contains("r9 ") || lower.contains("r7 ") || lower.contains("hd 7")
            || lower.contains("hd 8") || lower.contains("firepro d") || lower.contains("firepro w")
        {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(12.0),
                vec!["Older AMD GCN paths should be capped at Monterey natively, extensible via OCLP.".into()],
                false, false, false, false, None);
        }
        if lower.contains("hd 5") || lower.contains("hd 6") {
            return assessment(name, &vendor, GpuSupportTier::SupportedWithLimit, Some(10.13),
                vec!["AMD TeraScale paths are capped at High Sierra natively.".into()],
                false, false, false, false, None);
        }

        if lower.contains("vega 3") || lower.contains("vega 6") || lower.contains("vega 8")
            || lower.contains("vega 9") || lower.contains("vega 10") || lower.contains("vega 11")
            || lower.contains("radeon graphics") || lower.contains("amd radeon(tm) graphics")
        {
            return assessment(name, &vendor, GpuSupportTier::PartialSupport, Some(15.0),
                vec!["AMD Vega APUs require NootedRed and remain lower-confidence than native display paths.".into()],
                false, false, false, true, Some(false));
        }

        return assessment(name, &vendor, GpuSupportTier::Unknown, None,
            vec!["AMD GPU detected but the exact macOS support ceiling could not be classified from the model string.".into()],
            false, false, false, false, None);
    }

    assessment(name, "Unknown", GpuSupportTier::Unknown, None,
        vec!["GPU vendor could not be determined.".into()],
        false, false, false, false, None)
}

pub fn split_gpu_summary(gpu_summary: &str) -> Vec<HardwareGpuDeviceSummary> {
    gpu_summary.split(" / ")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|name| HardwareGpuDeviceSummary {
            name: name.into(), vendor_name: None, vendor_id: None, device_id: None,
        })
        .collect()
}

pub fn get_profile_gpu_devices(gpu: &str, gpu_devices: &Option<Vec<HardwareGpuDeviceSummary>>) -> Vec<HardwareGpuDeviceSummary> {
    if let Some(devs) = gpu_devices {
        if !devs.is_empty() { return devs.clone(); }
    }
    split_gpu_summary(gpu)
}

pub fn get_best_supported_gpu_path(devices: &[HardwareGpuDeviceSummary], target_version: Option<f64>) -> Option<GpuAssessment> {
    let mut candidates: Vec<GpuAssessment> = devices.iter()
        .map(classify_gpu)
        .filter(|a| {
            if a.tier == GpuSupportTier::Unsupported || a.tier == GpuSupportTier::Unknown { return false; }
            match (target_version, a.max_macos_version) {
                (Some(tv), Some(mv)) => mv >= tv,
                _ => true,
            }
        })
        .collect();

    if candidates.is_empty() { return None; }

    candidates.sort_by(|a, b| {
        let rank = |t: &GpuSupportTier| match t {
            GpuSupportTier::Supported => 3,
            GpuSupportTier::SupportedWithLimit => 2,
            GpuSupportTier::PartialSupport => 1,
            _ => 0,
        };
        let r = rank(&b.tier).cmp(&rank(&a.tier));
        if r != std::cmp::Ordering::Equal { return r; }
        let am = a.max_macos_version.unwrap_or(0.0);
        let bm = b.max_macos_version.unwrap_or(0.0);
        bm.partial_cmp(&am).unwrap_or(std::cmp::Ordering::Equal)
    });

    candidates.into_iter().next()
}

pub fn has_supported_display_path(devices: &[HardwareGpuDeviceSummary], target_version: Option<f64>) -> bool {
    get_best_supported_gpu_path(devices, target_version).is_some()
}

pub fn has_unsupported_discrete_gpu(devices: &[HardwareGpuDeviceSummary]) -> bool {
    devices.iter().map(classify_gpu)
        .any(|a| a.is_likely_discrete && a.tier == GpuSupportTier::Unsupported)
}

pub fn has_mac_pro_era_amd_gpu(gpus: &[HardwareGpuDeviceSummary]) -> bool {
    let re_vega_num = Regex::new(r"vega \d{1,2}\b").unwrap();
    gpus.iter().any(|gpu| {
        let lower = gpu.name.to_lowercase();
        lower.contains("polaris")
            || (lower.contains("vega") && !re_vega_num.is_match(&lower) && !lower.contains("radeon(tm) graphics"))
            || lower.contains("radeon vii")
            || lower.contains("rx 460") || lower.contains("rx 470") || lower.contains("rx 480")
            || lower.contains("rx 550") || lower.contains("rx 560") || lower.contains("rx 570")
            || lower.contains("rx 580") || lower.contains("rx 590")
            || lower.contains("rx 5500") || lower.contains("rx 5600") || lower.contains("rx 5700")
            || lower.contains("rx 6600") || lower.contains("rx 6650") || lower.contains("rx 6700")
            || lower.contains("rx 6750") || lower.contains("rx 6800") || lower.contains("rx 6900")
            || lower.contains("rx 6950")
    })
}

pub fn needs_navi_pikera(devices: &[HardwareGpuDeviceSummary]) -> bool {
    devices.iter().any(|d| classify_gpu(d).requires_pikera)
}

pub fn has_unsupported_modern_nvidia(devices: &[HardwareGpuDeviceSummary]) -> bool {
    devices.iter().map(classify_gpu)
        .any(|a| a.vendor == "NVIDIA" && a.tier == GpuSupportTier::Unsupported)
}

pub fn get_gpu_ceiling(devices: &[HardwareGpuDeviceSummary], target_version: Option<f64>) -> Option<f64> {
    get_best_supported_gpu_path(devices, target_version).and_then(|a| a.max_macos_version)
}
