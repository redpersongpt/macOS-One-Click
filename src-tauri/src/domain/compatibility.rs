//! Hardware compatibility matrix.
//! Ported from electron/compatibility.ts

use serde::{Deserialize, Serialize};
use super::rules::*;
use super::wifi_policy::*;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompatibilityLevel {
    Supported,
    Experimental,
    Risky,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigStrategy {
    Canonical,
    Conservative,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityNextAction {
    pub title: String,
    pub detail: String,
    pub source: String,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityAdvisoryConfidence {
    pub score: u32,
    pub label: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityFailurePoint {
    pub title: String,
    pub detail: String,
    pub likelihood: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReport {
    pub level: CompatibilityLevel,
    pub strategy: ConfigStrategy,
    pub confidence: String,
    pub explanation: String,
    pub manual_verification_required: bool,
    pub is_compatible: bool,
    pub max_os_version: String,
    pub eligible_versions: Vec<MacOSVersionOption>,
    pub recommended_version: String,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
    pub min_req_met: bool,
    pub next_actions: Vec<CompatibilityNextAction>,
    pub advisory_confidence: CompatibilityAdvisoryConfidence,
    pub most_likely_failure_points: Vec<CompatibilityFailurePoint>,
}

fn compat_rank(level: &CompatibilityLevel) -> u8 {
    match level {
        CompatibilityLevel::Supported => 0,
        CompatibilityLevel::Experimental => 1,
        CompatibilityLevel::Risky => 2,
        CompatibilityLevel::Blocked => 3,
    }
}

fn worsen(current: &CompatibilityLevel, next: &CompatibilityLevel) -> CompatibilityLevel {
    if compat_rank(next) > compat_rank(current) { next.clone() } else { current.clone() }
}

fn push_unique(items: &mut Vec<String>, value: &str) {
    if !items.iter().any(|s| s == value) { items.push(value.into()); }
}

fn apply_advisory_level(report: &mut CompatibilityReport, level: CompatibilityLevel, explanation: &str, warning: Option<&str>) {
    let current = report.level.clone();
    let next = worsen(&current, &level);
    report.level = next.clone();
    if next != CompatibilityLevel::Supported {
        report.strategy = ConfigStrategy::Conservative;
        report.manual_verification_required = true;
    }
    if let Some(w) = warning { push_unique(&mut report.warnings, w); }
    if compat_rank(&level) >= compat_rank(&current) {
        report.explanation = explanation.into();
    }
}

fn set_blocked(report: &mut CompatibilityReport, explanation: &str) {
    report.level = CompatibilityLevel::Blocked;
    report.strategy = ConfigStrategy::Blocked;
    report.is_compatible = false;
    report.explanation = explanation.into();
    report.eligible_versions = vec![];
    report.recommended_version = String::new();
    report.max_os_version = "Blocked".into();
}

fn cap_from_cpu(architecture: &str, generation: &str, cpu: &str) -> Option<f64> {
    if architecture == "Intel" {
        match generation {
            "Penryn" | "Wolfdale" | "Yorkfield" => return Some(10.13),
            "Nehalem" | "Arrandale" | "Clarkdale" | "Westmere" => return Some(11.0),
            "Sandy Bridge" | "Ivy Bridge" | "Ivy Bridge-E" | "Unknown" => return Some(12.0),
            "Haswell" | "Broadwell" | "Haswell-E" | "Broadwell-E" => return Some(12.0),
            _ => {}
        }
        let lower = cpu.to_lowercase();
        if lower.contains("pentium") || lower.contains("celeron") || lower.contains("atom") {
            return Some(12.0);
        }
    }
    None
}

/// Check hardware compatibility and generate a report.
/// This is a simplified port that covers the core logic.
pub fn check_compatibility(
    architecture: &str,
    generation: &str,
    cpu: &str,
    gpu: &str,
    gpu_devices: &Option<Vec<HardwareGpuDeviceSummary>>,
    is_laptop: bool,
    is_vm: bool,
    motherboard: &str,
    ram_str: &str,
    target_os: &str,
    wifi_chipset: Option<&str>,
    scan_confidence: Option<&str>,
) -> CompatibilityReport {
    let mut report = CompatibilityReport {
        level: CompatibilityLevel::Supported,
        strategy: ConfigStrategy::Canonical,
        confidence: scan_confidence.unwrap_or("low").into(),
        explanation: "System appears to be a valid OpenCore target.".into(),
        manual_verification_required: false,
        is_compatible: true,
        max_os_version: "macOS Tahoe 26".into(),
        eligible_versions: get_eligible_macos_versions(26.0),
        recommended_version: "macOS Sequoia 15".into(),
        warnings: vec![],
        errors: vec![],
        min_req_met: true,
        next_actions: vec![],
        advisory_confidence: CompatibilityAdvisoryConfidence {
            score: 50, label: "Medium confidence".into(),
            explanation: "Medium confidence based on the current hardware profile and target macOS version.".into(),
        },
        most_likely_failure_points: vec![],
    };

    let target_version = parse_macos_version(target_os);
    let devices = get_profile_gpu_devices(gpu, gpu_devices);
    let gpu_assessments: Vec<GpuAssessment> = devices.iter().map(classify_gpu).collect();
    let best_any = get_best_supported_gpu_path(&devices, None);
    let best_selected = get_best_supported_gpu_path(&devices, Some(target_version));
    let best_display_ceiling = get_gpu_ceiling(&devices, None);
    let cpu_ceiling = cap_from_cpu(architecture, generation, cpu);
    let mb = motherboard.to_lowercase();

    // Broadcom Wi-Fi
    let brcm = get_broadcom_wifi_policy(wifi_chipset, target_os);
    if let Some(ref policy) = brcm {
        match policy.support_class {
            BroadcomWifiSupportClass::SonomaRootPatch => {
                apply_advisory_level(&mut report, CompatibilityLevel::Risky,
                    &format!("Broadcom Wi-Fi path detected ({}).", policy.chipset),
                    Some(&format!("Broadcom Wi-Fi detected ({}). Sonoma+ not a clean native path.", policy.chipset)));
            }
            BroadcomWifiSupportClass::LegacyUnsupportedOnTarget => {
                apply_advisory_level(&mut report, CompatibilityLevel::Risky,
                    "Legacy Broadcom Wi-Fi path detected.", None);
            }
            BroadcomWifiSupportClass::UnknownBroadcom => {
                apply_advisory_level(&mut report, CompatibilityLevel::Experimental,
                    "Broadcom Wi-Fi path detected, but exact chipset support is not modeled.", None);
            }
            _ => {
                push_unique(&mut report.warnings, &policy.summary);
            }
        }
    }

    // Scan confidence
    if report.confidence == "low" {
        apply_advisory_level(&mut report, CompatibilityLevel::Risky,
            "Hardware detection was incomplete.", None);
    } else if report.confidence == "medium" {
        apply_advisory_level(&mut report, CompatibilityLevel::Experimental,
            "Some hardware values were inferred.", None);
    }

    // RAM check
    let ram_gb: u64 = ram_str.split_whitespace().next().and_then(|s| s.parse().ok()).unwrap_or(0);
    if ram_gb > 0 && ram_gb < 4 {
        push_unique(&mut report.warnings, "RAM is below 4 GB.");
        report.min_req_met = false;
        apply_advisory_level(&mut report, CompatibilityLevel::Experimental, "Low-memory system detected.", None);
    }

    // Apple Silicon
    if architecture == "Apple Silicon" {
        report.errors.push("Apple Silicon systems already run macOS natively.".into());
        set_blocked(&mut report, "Apple Silicon hardware is not a valid OpenCore/Hackintosh target.");
        return report;
    }

    // VM
    if is_vm {
        apply_advisory_level(&mut report, CompatibilityLevel::Risky,
            "Virtual machine target detected.", Some("Virtual machines need PCIe GPU passthrough."));
    }

    // Budget Intel
    let cpu_lower = cpu.to_lowercase();
    if cpu_lower.contains("pentium") || cpu_lower.contains("celeron") || cpu_lower.contains("atom") {
        if is_laptop {
            report.errors.push("Mobile Pentium/Celeron/Atom not valid targets.".into());
            set_blocked(&mut report, "Unsupported mobile Intel CPU family.");
            return report;
        }
        if !has_supported_display_path(&devices, None) {
            report.errors.push("Desktop Pentium/Celeron requires a separate supported display GPU.".into());
            set_blocked(&mut report, "No supported display path.");
            return report;
        }
        apply_advisory_level(&mut report, CompatibilityLevel::Risky, "Low-end Intel desktop path.", None);
    }

    // AMD laptop
    if architecture == "AMD" && is_laptop {
        let has_limited = gpu_assessments.iter().any(|a| {
            a.requires_nooted_red
                || a.name.to_lowercase().contains("5300m")
                || a.name.to_lowercase().contains("5500m")
                || a.name.to_lowercase().contains("5600m")
                || a.name.to_lowercase().contains("5700m")
        });
        if !has_limited {
            report.errors.push("AMD laptops not generally supported.".into());
            set_blocked(&mut report, "Unsupported AMD laptop path.");
            return report;
        }
        apply_advisory_level(&mut report, CompatibilityLevel::Risky, "AMD laptop path detected.", None);
    }

    // No display path
    if !is_vm && !has_supported_display_path(&devices, None) {
        report.errors.push("No supported display path remains.".into());
        set_blocked(&mut report, "OpenCore build blocked because no supported display path remains.");
        return report;
    }

    // Unsupported dGPU
    if is_laptop && has_unsupported_discrete_gpu(&devices) {
        apply_advisory_level(&mut report, CompatibilityLevel::Experimental,
            "Laptop with unsupported discrete GPU.", Some("Laptop dGPU must be disabled."));
    } else if !is_laptop && has_unsupported_discrete_gpu(&devices) {
        apply_advisory_level(&mut report, CompatibilityLevel::Experimental,
            "Unsupported discrete GPU detected.", Some("Use iGPU or supported AMD GPU for display."));
    }

    // GPU notes as warnings
    for a in &gpu_assessments {
        for note in &a.notes {
            if a.tier != GpuSupportTier::Unsupported {
                push_unique(&mut report.warnings, note);
            }
        }
    }

    // NootRX / NootedRed
    if let Some(ref best) = best_any {
        if best.requires_noot_rx {
            apply_advisory_level(&mut report, CompatibilityLevel::Risky, "AMD Navi 22 requires NootRX.", None);
        }
        if best.requires_nooted_red {
            apply_advisory_level(&mut report, CompatibilityLevel::Risky, "AMD Vega APU requires NootedRed.", None);
        }
    }

    // NVMe
    if mb.contains("pm981") || mb.contains("pm991") || mb.contains("2200s") {
        apply_advisory_level(&mut report, CompatibilityLevel::Experimental, "Known-problem NVMe path.", None);
    }
    if mb.contains("600p") {
        apply_advisory_level(&mut report, CompatibilityLevel::Experimental, "Intel 600p NVMe detected.", None);
    }

    // Version ceiling
    let mut max_version: f64 = 26.0;
    if let Some(cc) = cpu_ceiling { max_version = max_version.min(cc); }
    if let Some(dc) = best_display_ceiling { max_version = max_version.min(dc); }

    let eligible = get_eligible_macos_versions(max_version);
    report.eligible_versions = eligible.clone();
    report.max_os_version = eligible.first().map(|v| v.name.clone()).unwrap_or("Blocked".into());
    report.recommended_version = eligible.first().map(|v| v.name.clone()).unwrap_or_default();

    // Blocked if target exceeds ceiling
    if !is_vm && best_selected.is_none() && !has_supported_display_path(&devices, Some(target_version)) {
        let highest = eligible.first().map(|v| v.name.as_str()).unwrap_or("an older supported version");
        report.level = CompatibilityLevel::Blocked;
        report.strategy = ConfigStrategy::Blocked;
        report.is_compatible = false;
        report.errors.push(format!("Selected target {} exceeds GPU ceiling. Choose {} or older.", target_os, highest));
        report.explanation = format!("Target macOS is above the supported GPU ceiling. Select {} or older.", highest);
    }

    if !report.errors.is_empty() {
        report.is_compatible = false;
        report.level = CompatibilityLevel::Blocked;
        report.strategy = ConfigStrategy::Blocked;
    }

    report
}
