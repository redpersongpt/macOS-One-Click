//! Wi-Fi kext selection based on chipset family.
//! Ported from electron/wifiPolicy.ts

use super::rules::parse_macos_version;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WifiChipsetFamily {
    Intel,
    Broadcom,
    Other,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BroadcomWifiSupportClass {
    NativePreSonoma,
    FixupPreSonoma,
    LegacyFixup,
    LegacyUnsupportedOnTarget,
    SonomaRootPatch,
    UnknownBroadcom,
}

#[derive(Debug, Clone)]
pub struct BroadcomWifiPolicy {
    pub chipset: String,
    pub support_class: BroadcomWifiSupportClass,
    pub auto_kexts: Vec<String>,
    pub summary: String,
}

fn normalize_chipset(chipset: Option<&str>) -> String {
    chipset.unwrap_or("").trim().to_lowercase()
}

pub fn classify_wifi_chipset_family(chipset: Option<&str>) -> WifiChipsetFamily {
    let n = normalize_chipset(chipset);
    if n.is_empty() { return WifiChipsetFamily::Unknown; }
    if n.contains("intel") { return WifiChipsetFamily::Intel; }
    if n.contains("broadcom") { return WifiChipsetFamily::Broadcom; }
    WifiChipsetFamily::Other
}

pub fn get_broadcom_wifi_policy(chipset: Option<&str>, target_os: &str) -> Option<BroadcomWifiPolicy> {
    let normalized = normalize_chipset(chipset);
    if !normalized.contains("broadcom") { return None; }

    let os_ver = parse_macos_version(target_os);
    let cs = chipset.map(|s| s.trim().to_string()).unwrap_or_else(|| "Broadcom Wi-Fi".into());

    if normalized.contains("bcm4352") || normalized.contains("bcm43602") {
        if os_ver >= 14.0 {
            return Some(BroadcomWifiPolicy {
                chipset: cs, support_class: BroadcomWifiSupportClass::SonomaRootPatch,
                auto_kexts: vec![],
                summary: "Broadcom BCM4352/BCM43602-class Wi-Fi loses clean native support on Sonoma and newer, so it now needs OCLP/root patches or a card swap.".into(),
            });
        }
        return Some(BroadcomWifiPolicy {
            chipset: cs, support_class: BroadcomWifiSupportClass::FixupPreSonoma,
            auto_kexts: vec!["AirportBrcmFixup.kext".into()],
            summary: "Broadcom BCM4352/BCM43602-class Wi-Fi is supported on Ventura and older with AirportBrcmFixup.".into(),
        });
    }

    if normalized.contains("bcm4360") {
        if os_ver >= 14.0 {
            return Some(BroadcomWifiPolicy {
                chipset: cs, support_class: BroadcomWifiSupportClass::SonomaRootPatch,
                auto_kexts: vec![],
                summary: "Broadcom BCM4360-class Wi-Fi loses clean native support on Sonoma and newer, so it now needs OCLP/root patches or a card swap.".into(),
            });
        }
        return Some(BroadcomWifiPolicy {
            chipset: cs, support_class: BroadcomWifiSupportClass::NativePreSonoma,
            auto_kexts: vec![],
            summary: "Broadcom BCM4360-class Wi-Fi is a native-style path on Ventura and older and does not need an injected Wi-Fi kext by default.".into(),
        });
    }

    if normalized.contains("bcm4331") || normalized.contains("bcm43224") {
        if os_ver <= 10.15 {
            return Some(BroadcomWifiPolicy {
                chipset: cs, support_class: BroadcomWifiSupportClass::LegacyFixup,
                auto_kexts: vec!["AirportBrcmFixup.kext".into()],
                summary: "Broadcom BCM4331/BCM43224-class Wi-Fi is a Catalina-and-older legacy path that still needs AirportBrcmFixup.".into(),
            });
        }
        return Some(BroadcomWifiPolicy {
            chipset: cs, support_class: BroadcomWifiSupportClass::LegacyUnsupportedOnTarget,
            auto_kexts: vec![],
            summary: "Broadcom BCM4331/BCM43224-class Wi-Fi tops out around Catalina and should not be treated as a normal Big Sur-or-newer path.".into(),
        });
    }

    Some(BroadcomWifiPolicy {
        chipset: cs, support_class: BroadcomWifiSupportClass::UnknownBroadcom,
        auto_kexts: vec![],
        summary: "Detected a Broadcom Wi-Fi chipset that this generator does not classify cleanly yet. Do not assume a working native wireless path without manual verification.".into(),
    })
}
