//! Disk identity fingerprinting and collision detection.
//! Ported from electron/flashSafety.ts — disk identity section.

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::contracts::DiskInfo;

/// A fingerprint capturing the stable identity fields of a disk device.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiskIdentityFingerprint {
    pub serial_number: Option<String>,
    pub device_path: Option<String>,
    pub vendor: Option<String>,
    pub transport: Option<String>,
    pub partition_table: Option<String>,
    pub size_bytes: Option<u64>,
    pub model: Option<String>,
    pub removable: Option<bool>,
}

/// Field-level confidence for a fingerprint comparison.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FieldConfidence {
    Strong,
    Weak,
}

/// Result of comparing two disk identity fingerprints.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintComparison {
    pub matches: bool,
    pub confidence: FieldConfidence,
    pub matched_fields: Vec<String>,
    pub mismatched_fields: Vec<String>,
    pub missing_fields: Vec<String>,
}

/// Normalize a string identity value: trim + lowercase. Returns None if empty.
fn normalize_string(value: &Option<String>) -> Option<String> {
    value.as_ref().and_then(|v| {
        let trimmed = v.trim().to_lowercase();
        if trimmed.is_empty() { None } else { Some(trimmed) }
    })
}

/// Build a fingerprint from a DiskInfo, normalizing all string fields.
pub fn build_fingerprint(info: &DiskInfo) -> DiskIdentityFingerprint {
    DiskIdentityFingerprint {
        serial_number: normalize_string(&info.serial_number),
        device_path: Some(info.device_path.trim().to_lowercase()),
        vendor: normalize_string(&info.vendor),
        transport: normalize_string(&info.transport),
        partition_table: normalize_string(&info.partition_table),
        size_bytes: if info.size_bytes > 0 { Some(info.size_bytes) } else { None },
        model: normalize_string(&info.model),
        removable: Some(info.removable),
    }
}

/// Build a fingerprint from raw optional fields (for partial disk info).
pub fn build_fingerprint_from_partial(
    serial_number: Option<&str>,
    device_path: Option<&str>,
    vendor: Option<&str>,
    transport: Option<&str>,
    partition_table: Option<&str>,
    size_bytes: Option<u64>,
    model: Option<&str>,
    removable: Option<bool>,
) -> DiskIdentityFingerprint {
    DiskIdentityFingerprint {
        serial_number: serial_number.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
        device_path: device_path.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
        vendor: vendor.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
        transport: transport.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
        partition_table: partition_table.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
        size_bytes: size_bytes.filter(|&s| s > 0),
        model: model.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
        removable,
    }
}

/// Compare two fingerprints field by field.
///
/// Strong confidence: serial number or (device_path + vendor + model) all match.
/// Weak confidence: only subset of fields match, or critical fields missing.
pub fn compare_fingerprints(
    expected: &DiskIdentityFingerprint,
    actual: &DiskIdentityFingerprint,
) -> FingerprintComparison {
    let mut matched = Vec::new();
    let mut mismatched = Vec::new();
    let mut missing = Vec::new();

    // Compare string fields
    let string_fields: &[(&str, &Option<String>, &Option<String>)] = &[
        ("serial_number", &expected.serial_number, &actual.serial_number),
        ("device_path", &expected.device_path, &actual.device_path),
        ("vendor", &expected.vendor, &actual.vendor),
        ("transport", &expected.transport, &actual.transport),
        ("partition_table", &expected.partition_table, &actual.partition_table),
        ("model", &expected.model, &actual.model),
    ];

    for &(name, exp, act) in string_fields {
        match (exp, act) {
            (Some(e), Some(a)) => {
                if e == a {
                    matched.push(name.to_string());
                } else {
                    mismatched.push(name.to_string());
                }
            }
            (Some(_), None) | (None, Some(_)) => {
                missing.push(name.to_string());
            }
            (None, None) => {
                missing.push(name.to_string());
            }
        }
    }

    // Compare size_bytes
    match (expected.size_bytes, actual.size_bytes) {
        (Some(e), Some(a)) => {
            if e == a {
                matched.push("size_bytes".to_string());
            } else {
                mismatched.push("size_bytes".to_string());
            }
        }
        _ => missing.push("size_bytes".to_string()),
    }

    // Compare removable
    match (expected.removable, actual.removable) {
        (Some(e), Some(a)) => {
            if e == a {
                matched.push("removable".to_string());
            } else {
                mismatched.push("removable".to_string());
            }
        }
        _ => missing.push("removable".to_string()),
    }

    // Determine confidence
    let has_serial_match = matched.contains(&"serial_number".to_string());
    let has_path_vendor_model = matched.contains(&"device_path".to_string())
        && matched.contains(&"vendor".to_string())
        && matched.contains(&"model".to_string());

    let confidence = if has_serial_match || has_path_vendor_model {
        FieldConfidence::Strong
    } else {
        FieldConfidence::Weak
    };

    let all_match = mismatched.is_empty();

    info!(
        matched_count = matched.len(),
        mismatched_count = mismatched.len(),
        missing_count = missing.len(),
        ?confidence,
        "Disk fingerprint comparison complete"
    );

    FingerprintComparison {
        matches: all_match,
        confidence,
        matched_fields: matched,
        mismatched_fields: mismatched,
        missing_fields: missing,
    }
}

/// Check multiple devices for ambiguous matches against a target fingerprint.
/// Returns device paths that could be confused with the target.
pub fn find_collisions(
    target: &DiskIdentityFingerprint,
    all_devices: &[DiskInfo],
    target_device_path: &str,
) -> Vec<String> {
    let mut collisions = Vec::new();
    let target_path_normalized = target_device_path.trim().to_lowercase();

    for device in all_devices {
        let device_path_normalized = device.device_path.trim().to_lowercase();
        if device_path_normalized == target_path_normalized {
            continue; // Skip the target itself
        }

        let fp = build_fingerprint(device);
        let comparison = compare_fingerprints(target, &fp);

        // If the non-target device matches on most fields, it is a collision risk
        if comparison.matches || comparison.mismatched_fields.is_empty() {
            warn!(
                device = %device.device_path,
                "Ambiguous disk identity collision detected"
            );
            collisions.push(device.device_path.clone());
        }
    }

    collisions
}
