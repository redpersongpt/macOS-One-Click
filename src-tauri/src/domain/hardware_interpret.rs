//! Hardware interpretation to HardwareProfile.
//! Ported from electron/hardwareInterpret.ts
//!
//! This module provides interpretation metadata about how each hardware
//! component was identified. It does NOT invent data — it only works with
//! what the detection layer provides.

use serde::{Deserialize, Serialize};

/// How a fact was determined.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InterpretationBasis {
    Detected,
    Derived,
    Inferred,
    Unknown,
}

/// A single interpreted fact about the hardware.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedFact {
    pub label: String,
    pub value: String,
    pub basis: InterpretationBasis,
    pub reasoning: String,
    pub verify_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInterpretation {
    pub name: String,
    pub vendor: InterpretedFact,
    pub pci_ids: InterpretedFact,
    pub macos_support: InterpretedFact,
    pub driver_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInterpretation {
    pub name: String,
    pub vendor: InterpretedFact,
    pub architecture: InterpretedFact,
    pub generation: InterpretedFact,
    pub core_count: InterpretedFact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardInterpretation {
    pub vendor: InterpretedFact,
    pub model: InterpretedFact,
    pub form_factor: InterpretedFact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInterpretation {
    pub codec: InterpretedFact,
    pub layout_id: InterpretedFact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterpretation {
    pub ethernet: InterpretedFact,
    pub wifi: InterpretedFact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInterpretation {
    pub overall_confidence: String,
    pub summary: String,
    pub manual_verification_needed: Vec<String>,
    pub cpu: CpuInterpretation,
    pub primary_gpu: GpuInterpretation,
    pub all_gpus: Vec<GpuInterpretation>,
    pub board: BoardInterpretation,
    pub audio: AudioInterpretation,
    pub network: NetworkInterpretation,
    pub ram: InterpretedFact,
    pub vm_detected: InterpretedFact,
}

/// Derive CPU generation from name with basis tracking.
pub fn cpu_gen_from_name(name: &str) -> (String, InterpretationBasis, String) {
    let model = name.to_lowercase();

    if model.contains("apple") || regex::Regex::new(r"\bm[1-4]\b").unwrap().is_match(&model) {
        return ("Apple Silicon".into(), InterpretationBasis::Derived,
            "Detected CPU name contains Apple Silicon identifier.".into());
    }

    if model.contains("xeon") {
        if model.contains("w-") || model.contains("scalable") {
            return ("Cascade Lake-X".into(), InterpretationBasis::Inferred,
                "Detected Xeon W or Scalable series. Mapped to Cascade Lake-X — approximate.".into());
        }
        if model.contains("e5-v4") { return ("Broadwell-E".into(), InterpretationBasis::Derived, "Xeon E5 v4 → Broadwell-E".into()); }
        if model.contains("e5-v3") { return ("Haswell-E".into(), InterpretationBasis::Derived, "Xeon E5 v3 → Haswell-E".into()); }
        if model.contains("e5-v2") { return ("Ivy Bridge-E".into(), InterpretationBasis::Derived, "Xeon E5 v2 → Ivy Bridge-E".into()); }
        return ("Haswell-E".into(), InterpretationBasis::Inferred, "Xeon model without version suffix, defaulted to Haswell-E.".into());
    }

    let re = regex::Regex::new(r"i\d-?\s?(1?\d{4})").unwrap();
    if let Some(caps) = re.captures(&model) {
        if let Ok(num) = caps[1].parse::<u32>() {
            let thresholds: &[(u32, &str)] = &[
                (14000, "Raptor Lake"), (13000, "Raptor Lake"), (12000, "Alder Lake"),
                (11000, "Rocket Lake"), (10000, "Comet Lake"), (8000, "Coffee Lake"),
                (7000, "Kaby Lake"), (6000, "Skylake"), (5000, "Broadwell"),
                (4000, "Haswell"), (3000, "Ivy Bridge"), (2000, "Sandy Bridge"),
            ];
            for &(thresh, gen) in thresholds {
                if num >= thresh {
                    return (gen.into(), InterpretationBasis::Derived,
                        format!("CPU model number {} → {}", num, gen));
                }
            }
        }
    }

    if model.contains("threadripper") { return ("Threadripper".into(), InterpretationBasis::Derived, "Threadripper branding detected.".into()); }
    if model.contains("ryzen") { return ("Ryzen".into(), InterpretationBasis::Derived, "Ryzen branding detected.".into()); }
    if model.contains("fx-") || model.contains("phenom") || model.contains("athlon") {
        return ("Bulldozer".into(), InterpretationBasis::Inferred, "Legacy AMD branding → Bulldozer family.".into());
    }
    if model.contains("core 2") || model.contains("quad") || model.contains("extreme") {
        return ("Penryn".into(), InterpretationBasis::Derived, "Core 2 branding → Penryn family.".into());
    }
    if model.contains("pentium") || model.contains("celeron") {
        return ("Ivy Bridge".into(), InterpretationBasis::Inferred, "Budget Intel, defaulted to Ivy Bridge.".into());
    }

    ("Unknown".into(), InterpretationBasis::Unknown, "CPU model could not be matched to any known generation.".into())
}

/// Derive CPU architecture from name with basis tracking.
pub fn cpu_arch_from_name(name: &str) -> (String, InterpretationBasis, String) {
    let model = name.to_lowercase();
    if model.contains("apple") || regex::Regex::new(r"\bm[1-4]\b").unwrap().is_match(&model) {
        return ("Apple Silicon".into(), InterpretationBasis::Derived, "Apple Silicon identifier in CPU name.".into());
    }
    if model.contains("ryzen") || model.contains("threadripper") || model.contains("fx-")
        || model.contains("phenom") || model.contains("athlon") {
        return ("AMD".into(), InterpretationBasis::Derived, "AMD product name detected.".into());
    }
    let i_re = regex::Regex::new(r"i\d-").unwrap();
    if model.contains("intel") || i_re.is_match(&model) || model.contains("xeon")
        || model.contains("core 2") || model.contains("pentium") || model.contains("celeron") {
        return ("Intel".into(), InterpretationBasis::Derived, "Intel product name detected.".into());
    }
    ("Unknown".into(), InterpretationBasis::Unknown, "CPU vendor could not be determined.".into())
}
