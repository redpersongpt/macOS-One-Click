//! Laptop vs desktop classification via weighted evidence fusion.
//! Ported from electron/formFactor.ts.

use once_cell::sync::Lazy;
use regex::Regex;

/// SMBIOS chassis types that indicate a portable/laptop form factor.
const LAPTOP_CHASSIS: &[u32] = &[8, 9, 10, 11, 12, 14, 18, 21, 31, 32];

/// CPU suffixes that are ALWAYS laptop/mobile -- never used in desktop CPUs.
/// U = ultra-low-power mobile, Y = extreme low-power mobile.
static DEFINITIVE_MOBILE_CPU: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\d(U)\s*(?:CPU|@|\b)|\d(Y)\d").expect("regex"));

/// CPU suffixes that are mobile-class but occasionally used in small form factor
/// desktops (NUCs, mini PCs). Need battery or model hint to confirm laptop.
static MOBILE_CPU_SUFFIX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\d(HQ|MQ|G[1-7]|H|HS|HX|P)\s*(?:CPU|@|\b)").expect("regex"));

/// Known laptop family names in product/model strings.
static PORTABLE_MODEL_HINT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(book|laptop|notebook|ultrabook|surface|thinkpad|ideapad|yoga|elitebook|probook|latitude|precision|xps|zenbook|vivobook|travelmate|lifebook|spectre|envy|pavilion.*laptop|inspiron.*laptop|vostro)\b").expect("regex")
});

/// OEM manufacturer + model patterns that definitively indicate a laptop family.
static OEM_LAPTOP_MODEL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(probook|elitebook|zbook|latitude|thinkpad|ideapad|yoga|zenbook|vivobook|travelmate|lifebook|spectre|swift|aspire.*notebook)\b").expect("regex")
});

/// Mobile GPU naming patterns -- discrete GPUs with mobile suffixes.
static MOBILE_GPU_HINT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(M\d{3,4}|MX\d{2,3}|GTX?\s*\d{3,4}M)\b").expect("regex"));

/// Evidence bundle for form factor inference.
pub struct FormFactorEvidence<'a> {
    pub cpu_name: &'a str,
    pub chassis_types: &'a [u32],
    pub model_name: &'a str,
    pub battery_present: bool,
    pub manufacturer: &'a str,
    pub gpu_name: &'a str,
}

/// Determine whether the machine is a laptop using weighted evidence fusion.
///
/// Uses three tiers of evidence:
/// - DEFINITIVE: Any single definitive signal is sufficient (chassis type, model
///   name hint, U/Y CPU suffix). These are never ambiguous.
/// - STRONG: Two or more strong signals together are sufficient (mobile CPU suffix +
///   battery, mobile CPU suffix + mobile GPU, battery + manufacturer laptop family).
/// - FALLBACK: Conservative -- insufficient evidence stays desktop.
pub fn infer_laptop_form_factor(ev: &FormFactorEvidence<'_>) -> bool {
    // -- Tier 1: Definitive signals (any one is sufficient) --

    // Chassis type from SMBIOS -- authoritative when present
    if ev.chassis_types.iter().any(|ct| LAPTOP_CHASSIS.contains(ct)) {
        return true;
    }

    // Model name matches known laptop family
    if !ev.model_name.is_empty() && PORTABLE_MODEL_HINT.is_match(ev.model_name) {
        return true;
    }

    // U/Y CPU suffix -- these are NEVER used in desktop CPUs
    if DEFINITIVE_MOBILE_CPU.is_match(ev.cpu_name) {
        return true;
    }

    // -- Tier 2: Strong combined signals (two or more needed) --

    let has_mobile_cpu = MOBILE_CPU_SUFFIX.is_match(ev.cpu_name);
    let has_battery = ev.battery_present;
    let has_laptop_model =
        OEM_LAPTOP_MODEL.is_match(ev.model_name) || OEM_LAPTOP_MODEL.is_match(ev.manufacturer);
    let has_mobile_gpu = MOBILE_GPU_HINT.is_match(ev.gpu_name);

    // Mobile CPU (H/HQ/MQ/etc.) + battery -> laptop
    if has_mobile_cpu && has_battery {
        return true;
    }

    // Mobile CPU + known laptop OEM model -> laptop
    if has_mobile_cpu && has_laptop_model {
        return true;
    }

    // Battery + known laptop OEM model -> laptop
    if has_battery && has_laptop_model {
        return true;
    }

    // Mobile GPU + any other laptop hint -> laptop
    if has_mobile_gpu && (has_mobile_cpu || has_battery || has_laptop_model) {
        return true;
    }

    // Battery + mobile GPU -> laptop
    if has_battery && has_mobile_gpu {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev<'a>(cpu: &'a str) -> FormFactorEvidence<'a> {
        FormFactorEvidence {
            cpu_name: cpu,
            chassis_types: &[],
            model_name: "",
            battery_present: false,
            manufacturer: "",
            gpu_name: "",
        }
    }

    #[test]
    fn definitive_u_suffix() {
        assert!(infer_laptop_form_factor(&FormFactorEvidence {
            cpu_name: "Intel Core i5-4510U CPU @ 2.00GHz",
            ..ev("")
        }));
    }

    #[test]
    fn chassis_type_laptop() {
        assert!(infer_laptop_form_factor(&FormFactorEvidence {
            cpu_name: "Intel Core i7-9750H",
            chassis_types: &[10],
            ..ev("")
        }));
    }

    #[test]
    fn desktop_stays_desktop() {
        assert!(!infer_laptop_form_factor(&ev("Intel Core i7-9700K")));
    }

    #[test]
    fn mobile_cpu_plus_battery() {
        assert!(infer_laptop_form_factor(&FormFactorEvidence {
            cpu_name: "Intel Core i7-9750H CPU @ 2.60GHz",
            battery_present: true,
            ..ev("")
        }));
    }
}
