//! CPU generation / architecture mapping.
//! Ported from electron/hardwareMapper.ts

use regex::Regex;

/// Detect CPU generation from model name string.
pub fn detect_cpu_generation(cpu_model: &str) -> String {
    let model = cpu_model.to_lowercase();

    if model.contains("apple") || model.contains("m1") || model.contains("m2")
        || model.contains("m3") || model.contains("m4") {
        return "Apple Silicon".into();
    }

    // HEDT / Xeon
    if model.contains("xeon") {
        if model.contains("w-") || model.contains("scalable") { return "Cascade Lake-X".into(); }
        if model.contains("e5-v4") || model.contains("e5-v3") { return "Broadwell-E".into(); }
        if model.contains("e5-v2") { return "Ivy Bridge-E".into(); }
        return "Haswell-E".into();
    }

    // Standard Core i series
    let re = Regex::new(r"i\d-?\s?(1?\d{4})").unwrap();
    if let Some(caps) = re.captures(&model) {
        if let Ok(num) = caps[1].parse::<u32>() {
            let ice_lake_re = Regex::new(r"\bg[147]\b").unwrap();
            if num >= 10000 && num < 11000 && (ice_lake_re.is_match(&model) || model.contains("ice lake")) {
                return "Ice Lake".into();
            }
            if num >= 14000 { return "Raptor Lake".into(); }
            if num >= 13000 { return "Raptor Lake".into(); }
            if num >= 12000 { return "Alder Lake".into(); }
            if num >= 11000 { return "Rocket Lake".into(); }
            if num >= 10000 { return "Comet Lake".into(); }
            if num >= 8000 { return "Coffee Lake".into(); }
            if num >= 7000 { return "Kaby Lake".into(); }
            if num >= 6000 { return "Skylake".into(); }
            if num >= 5000 { return "Broadwell".into(); }
            if num >= 4000 { return "Haswell".into(); }
            if num >= 3000 { return "Ivy Bridge".into(); }
            if num >= 2000 { return "Sandy Bridge".into(); }
        }
    }

    // Legacy Core i3/i5/i7 3-4 digit models
    let legacy_re = Regex::new(r"i[357]-?\s*(\d{3,4})([a-z]{0,2})").unwrap();
    if let Some(caps) = legacy_re.captures(&model) {
        if let Ok(num) = caps[1].parse::<u32>() {
            let suffix = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            if num >= 900 && num < 1000 { return "Nehalem".into(); }
            if num >= 800 && num < 900 { return "Nehalem".into(); }
            if num >= 700 && num < 800 { return "Westmere".into(); }
            if num >= 600 && num < 700 { return "Clarkdale".into(); }
            if num >= 400 && num < 600 {
                if suffix.contains('l') || suffix.contains('m') || suffix.contains('q') || suffix.contains('u') {
                    return "Arrandale".into();
                }
                return "Clarkdale".into();
            }
        }
    }

    // Budget Intel Desktop
    if model.contains("pentium") || model.contains("celeron") {
        if model.contains("gold") { return "Coffee Lake".into(); }
        let g45 = Regex::new(r"g[45]\d{2}").unwrap();
        if g45.is_match(&model) { return "Skylake".into(); }
        let g3 = Regex::new(r"g3\d{2}").unwrap();
        if g3.is_match(&model) { return "Haswell".into(); }
        let g12 = Regex::new(r"g[12]\d{2}|g[68]\d0").unwrap();
        if g12.is_match(&model) { return "Sandy Bridge".into(); }
        return "Ivy Bridge".into();
    }

    // Legacy Intel Desktop
    let q9 = Regex::new(r"\bq9\d{3}\b").unwrap();
    if model.contains("core 2 quad") || q9.is_match(&model) { return "Yorkfield".into(); }
    let e8_e7 = Regex::new(r"\be[78]\d{3}\b").unwrap();
    if model.contains("core 2 duo") || e8_e7.is_match(&model) { return "Wolfdale".into(); }
    if model.contains("core 2") || model.contains("quad") || model.contains("extreme") {
        return "Penryn".into();
    }

    // AMD
    if model.contains("threadripper") { return "Threadripper".into(); }
    if model.contains("ryzen") { return "Ryzen".into(); }
    if model.contains("fx-") || model.contains("phenom") || model.contains("athlon") {
        return "Bulldozer".into();
    }

    "Unknown".into()
}

/// Detect CPU architecture from model name string.
pub fn detect_architecture(cpu_model: &str) -> String {
    let model = cpu_model.to_lowercase();
    if model.contains("apple") || model.contains("m1") || model.contains("m2")
        || model.contains("m3") || model.contains("m4") { return "Apple Silicon".into(); }
    if model.contains("ryzen") || model.contains("threadripper") || model.contains("amd") { return "AMD".into(); }
    let i_re = Regex::new(r"i\d-").unwrap();
    if model.contains("intel") || i_re.is_match(&model) { return "Intel".into(); }
    "Unknown".into()
}
