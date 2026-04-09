//! SSDT source policy — maps requested SSDT filenames to download sources.
//! Ported from electron/ssdtSourcePolicy.ts

use std::collections::HashSet;

const DORTANIA_ACPI_BASE: &str =
    "https://raw.githubusercontent.com/dortania/Getting-Started-With-ACPI/master/extra-files/compiled";

#[derive(Debug, Clone)]
pub struct SsdtSupplementalDownload {
    pub catalog: String,
    pub file_name: String,
    pub url: String,
}

#[derive(Debug, Clone)]
pub struct SsdtSourcePolicy {
    pub requested_file_name: String,
    pub package_candidates: Vec<String>,
    pub supplemental_download: Option<SsdtSupplementalDownload>,
}

pub fn is_optional_ssdt(requested_file_name: &str) -> bool {
    matches!(requested_file_name, "SSDT-GPIO.aml")
}

fn dortania_supplemental(file_name: &str) -> SsdtSupplementalDownload {
    SsdtSupplementalDownload {
        catalog: "dortania".into(),
        file_name: file_name.into(),
        url: format!("{}/{}", DORTANIA_ACPI_BASE, file_name),
    }
}

fn opencore_pkg_acpi_sample_files() -> HashSet<&'static str> {
    [
        "SSDT-ALS0.aml", "SSDT-AWAC-DISABLE.aml", "SSDT-BRG0.aml", "SSDT-EC-USBX.aml",
        "SSDT-EC.aml", "SSDT-EHCx-DISABLE.aml", "SSDT-HV-DEV-WS2022.aml", "SSDT-HV-DEV.aml",
        "SSDT-HV-PLUG.aml", "SSDT-HV-VMBUS.aml", "SSDT-IMEI.aml", "SSDT-PLUG-ALT.aml",
        "SSDT-PLUG.aml", "SSDT-PMC.aml", "SSDT-PNLF.aml", "SSDT-RTC0-RANGE.aml",
        "SSDT-RTC0.aml", "SSDT-SBUS-MCHC.aml", "SSDT-UNC.aml",
    ].into_iter().collect()
}

fn dortania_compiled_acpi_files() -> HashSet<&'static str> {
    [
        "SSDT-AWAC.aml", "SSDT-CPUR.aml", "SSDT-EC-DESKTOP.aml", "SSDT-EC-LAPTOP.aml",
        "SSDT-EC-USBX-DESKTOP.aml", "SSDT-EC-USBX-LAPTOP.aml", "SSDT-IMEI-S.aml",
        "SSDT-IMEI.aml", "SSDT-PLUG-DRTNIA.aml", "SSDT-PMC.aml", "SSDT-PNLF.aml",
        "SSDT-RHUB.aml", "SSDT-RTC0-RANGE-HEDT.aml", "SSDT-UNC.aml", "SSDT-XOSI.aml",
        "SSDT-GPIO.aml",
    ].into_iter().collect()
}

pub fn get_ssdt_source_policy(requested_file_name: &str) -> Option<SsdtSourcePolicy> {
    // Explicit policies
    match requested_file_name {
        "SSDT-AWAC.aml" => return Some(SsdtSourcePolicy {
            requested_file_name: requested_file_name.into(),
            package_candidates: vec!["SSDT-AWAC.aml".into(), "SSDT-AWAC-DISABLE.aml".into()],
            supplemental_download: Some(dortania_supplemental("SSDT-AWAC.aml")),
        }),
        "SSDT-CPUR.aml" => return Some(SsdtSourcePolicy {
            requested_file_name: requested_file_name.into(),
            package_candidates: vec!["SSDT-CPUR.aml".into()],
            supplemental_download: Some(dortania_supplemental("SSDT-CPUR.aml")),
        }),
        "SSDT-EC-USBX-DESKTOP.aml" => return Some(SsdtSourcePolicy {
            requested_file_name: requested_file_name.into(),
            package_candidates: vec!["SSDT-EC-USBX-DESKTOP.aml".into()],
            supplemental_download: Some(dortania_supplemental("SSDT-EC-USBX-DESKTOP.aml")),
        }),
        "SSDT-XOSI.aml" => return Some(SsdtSourcePolicy {
            requested_file_name: requested_file_name.into(),
            package_candidates: vec!["SSDT-XOSI.aml".into()],
            supplemental_download: Some(dortania_supplemental("SSDT-XOSI.aml")),
        }),
        _ => {}
    }

    if opencore_pkg_acpi_sample_files().contains(requested_file_name) {
        return Some(SsdtSourcePolicy {
            requested_file_name: requested_file_name.into(),
            package_candidates: vec![requested_file_name.into()],
            supplemental_download: None,
        });
    }

    if dortania_compiled_acpi_files().contains(requested_file_name) {
        return Some(SsdtSourcePolicy {
            requested_file_name: requested_file_name.into(),
            package_candidates: vec![requested_file_name.into()],
            supplemental_download: Some(dortania_supplemental(requested_file_name)),
        });
    }

    None
}

pub fn get_ssdt_download_candidates(requested_file_name: &str) -> Vec<SsdtSupplementalDownload> {
    let mut candidates = match requested_file_name {
        "SSDT-PLUG.aml" | "SSDT-PLUG-ALT.aml" => {
            vec![dortania_supplemental("SSDT-PLUG-DRTNIA.aml")]
        }
        "SSDT-EC.aml" => vec![dortania_supplemental("SSDT-EC-DESKTOP.aml")],
        "SSDT-EC-LAPTOP.aml" => vec![dortania_supplemental("SSDT-EC-LAPTOP.aml")],
        "SSDT-EC-USBX.aml" => vec![dortania_supplemental("SSDT-EC-USBX-DESKTOP.aml")],
        "SSDT-EC-USBX-LAPTOP.aml" => vec![dortania_supplemental("SSDT-EC-USBX-LAPTOP.aml")],
        "SSDT-RTC0-RANGE.aml" => vec![dortania_supplemental("SSDT-RTC0-RANGE-HEDT.aml")],
        _ => Vec::new(),
    };

    let direct_candidate = dortania_supplemental(requested_file_name);
    if !candidates.iter().any(|candidate| candidate.file_name == direct_candidate.file_name) {
        candidates.push(direct_candidate);
    }

    candidates
}

pub fn get_unsupported_ssdt_requests(requested_file_names: &[String]) -> Vec<String> {
    let mut unsupported: Vec<String> = requested_file_names.iter()
        .filter(|name| get_ssdt_source_policy(name).is_none())
        .cloned()
        .collect();
    unsupported.sort();
    unsupported.dedup();
    unsupported
}
