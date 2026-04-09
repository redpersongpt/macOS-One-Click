//! Firmware/BIOS preflight probe command.
//! Ported from electron/firmwarePreflight.ts — Windows, Linux, macOS paths.

use tracing::{info, warn};

use crate::contracts::*;
use crate::error::AppError;

/// Evidence level for firmware probe results.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
enum EvidenceLevel {
    Authoritative,
    Heuristic,
    None,
}

/// Internal probe input for a single requirement.
struct RequirementInput {
    detected: Option<bool>,
    expected_truthy: bool,
    evidence_level: EvidenceLevel,
    source: String,
}

/// Classify a requirement input into a status string and source.
fn classify(input: &RequirementInput) -> (String, String) {
    if input.evidence_level == EvidenceLevel::None || input.detected.is_none() {
        return ("unverified".into(), input.source.clone());
    }

    let met = input.detected == Some(input.expected_truthy);

    if input.evidence_level == EvidenceLevel::Authoritative {
        let status = if met { "confirmed" } else { "failing" };
        return (status.into(), input.source.clone());
    }

    // Heuristic: always inferred regardless of value
    ("inferred".into(), input.source.clone())
}

/// Build FirmwareCheck entries from probe inputs.
fn build_firmware_checks(
    uefi: Option<&RequirementInput>,
    secure_boot: Option<&RequirementInput>,
    vtx: Option<&RequirementInput>,
    vtd: Option<&RequirementInput>,
    above4g: Option<&RequirementInput>,
    not_applicable: bool,
) -> Vec<FirmwareCheck> {
    let pick = |input: Option<&RequirementInput>| -> (String, String) {
        if not_applicable {
            return ("not_applicable".into(), "cannot detect remote machine firmware".into());
        }
        match input {
            Some(inp) => classify(inp),
            None => ("unverified".into(), "not detectable on this platform".into()),
        }
    };

    let (uefi_status, uefi_source) = pick(uefi);
    let (sb_status, sb_source) = pick(secure_boot);
    let (vtx_status, vtx_source) = pick(vtx);
    let (vtd_status, vtd_source) = pick(vtd);
    let (above4g_status, above4g_source) = pick(above4g);

    vec![
        FirmwareCheck {
            name: "UEFI Boot Mode".into(),
            status: uefi_status,
            evidence: uefi_source,
            required: true,
        },
        FirmwareCheck {
            name: "Secure Boot".into(),
            status: sb_status,
            evidence: sb_source,
            required: true,
        },
        FirmwareCheck {
            name: "CPU Virtualisation (VT-x / AMD-V)".into(),
            status: vtx_status,
            evidence: vtx_source,
            required: false,
        },
        FirmwareCheck {
            name: "VT-d / AMD-Vi (IOMMU)".into(),
            status: vtd_status,
            evidence: vtd_source,
            required: false,
        },
        FirmwareCheck {
            name: "Above 4G Decoding".into(),
            status: above4g_status,
            evidence: above4g_source,
            required: false,
        },
    ]
}

/// Run a shell command and return its stdout, or empty string on failure.
async fn run_probe(cmd: &str, timeout_ms: u64) -> String {
    let cmd_owned = cmd.to_string();
    let result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        tokio::task::spawn_blocking(move || {
            std::process::Command::new(if cfg!(target_os = "windows") { "powershell" } else { "sh" })
                .args(if cfg!(target_os = "windows") {
                    vec!["-NoProfile", "-NonInteractive", "-Command", &cmd_owned]
                } else {
                    vec!["-c", &cmd_owned]
                })
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(output))) => String::from_utf8_lossy(&output.stdout).trim().to_string(),
        Ok(Ok(Err(e))) => {
            warn!(cmd = %cmd, error = %e, "Probe command failed");
            String::new()
        }
        Ok(Err(e)) => {
            warn!(cmd = %cmd, error = %e, "Probe task panicked");
            String::new()
        }
        Err(_) => {
            warn!(cmd = %cmd, "Probe command timed out");
            String::new()
        }
    }
}

#[tauri::command]
pub async fn probe_firmware() -> Result<FirmwareReport, AppError> {
    info!("Starting firmware probe");

    #[cfg(target_os = "windows")]
    {
        probe_firmware_windows().await
    }

    #[cfg(target_os = "linux")]
    {
        probe_firmware_linux().await
    }

    #[cfg(target_os = "macos")]
    {
        probe_firmware_mac().await
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "Firmware probing is not supported on this platform",
        ))
    }
}

// ── Windows ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
async fn probe_firmware_windows() -> Result<FirmwareReport, AppError> {
    info!("Running Windows firmware probe");

    // Run all probes in parallel
    let (bios_res, sb_cmdlet_res, vt_res, vtd_res, sb_reg_res) = tokio::join!(
        run_probe(
            "Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, ReleaseDate | ConvertTo-Json -Compress",
            5000
        ),
        run_probe(
            "try { $v = Confirm-SecureBootUEFI; $v.ToString().ToLower() } catch { 'cmdlet-error' }",
            5000
        ),
        run_probe(
            "try { (Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled.ToString().ToLower() } catch { '' }",
            5000
        ),
        run_probe(
            r#"try { $null = [System.IO.File]::ReadAllBytes("\\?\Global??\GLOBALROOT\Device\Mup\acpi\DMAR"); "present" } catch { "absent" }"#,
            5000
        ),
        run_probe(
            r#"try { (Get-ItemPropertyValue "HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State" -Name "UEFISecureBootEnabled").ToString() } catch { "unknown" }"#,
            5000
        ),
    );

    // ── UEFI mode + Secure Boot ──
    let sb_cmdlet = sb_cmdlet_res.to_lowercase();
    let (uefi_input, sb_input) = if sb_cmdlet == "true" || sb_cmdlet == "false" {
        // Cmdlet succeeded -> confirmed UEFI; Secure Boot state is authoritative
        (
            RequirementInput {
                detected: Some(true),
                expected_truthy: true,
                evidence_level: EvidenceLevel::Authoritative,
                source: "Confirm-SecureBootUEFI PowerShell".into(),
            },
            RequirementInput {
                detected: Some(sb_cmdlet == "true"),
                expected_truthy: false, // requirement: must be off
                evidence_level: EvidenceLevel::Authoritative,
                source: "Confirm-SecureBootUEFI PowerShell".into(),
            },
        )
    } else if sb_cmdlet == "cmdlet-error" {
        // Cmdlet threw -> very likely Legacy BIOS
        let sb_reg = sb_reg_res.trim();
        let sb_input = if sb_reg == "0" || sb_reg == "1" {
            RequirementInput {
                detected: Some(sb_reg == "1"),
                expected_truthy: false,
                evidence_level: EvidenceLevel::Heuristic,
                source: "HKLM UEFISecureBootEnabled registry".into(),
            }
        } else {
            RequirementInput {
                detected: None,
                expected_truthy: false,
                evidence_level: EvidenceLevel::None,
                source: "not detectable -- Confirm-SecureBootUEFI unavailable".into(),
            }
        };
        (
            RequirementInput {
                detected: Some(false),
                expected_truthy: true,
                evidence_level: EvidenceLevel::Authoritative,
                source: "Confirm-SecureBootUEFI PowerShell".into(),
            },
            sb_input,
        )
    } else {
        // PowerShell blocked or unexpected output -> registry fallback
        let sb_reg = sb_reg_res.trim();
        if sb_reg == "0" || sb_reg == "1" {
            (
                RequirementInput {
                    detected: Some(true),
                    expected_truthy: true,
                    evidence_level: EvidenceLevel::Heuristic,
                    source: "HKLM UEFISecureBootEnabled registry".into(),
                },
                RequirementInput {
                    detected: Some(sb_reg == "1"),
                    expected_truthy: false,
                    evidence_level: EvidenceLevel::Heuristic,
                    source: "HKLM UEFISecureBootEnabled registry".into(),
                },
            )
        } else {
            (
                RequirementInput {
                    detected: None,
                    expected_truthy: true,
                    evidence_level: EvidenceLevel::None,
                    source: "PowerShell probing unavailable".into(),
                },
                RequirementInput {
                    detected: None,
                    expected_truthy: false,
                    evidence_level: EvidenceLevel::None,
                    source: "PowerShell probing unavailable".into(),
                },
            )
        }
    };

    // ── VT-x ──
    let vt_out = vt_res.to_lowercase();
    let vtx_input = if vt_out == "true" || vt_out == "false" {
        RequirementInput {
            detected: Some(vt_out == "true"),
            expected_truthy: true,
            evidence_level: EvidenceLevel::Authoritative,
            source: "Win32_Processor.VirtualizationFirmwareEnabled CIM".into(),
        }
    } else {
        RequirementInput {
            detected: None,
            expected_truthy: true,
            evidence_level: EvidenceLevel::None,
            source: "Win32_Processor CIM query failed".into(),
        }
    };

    // ── VT-d (ACPI DMAR heuristic) ──
    let vtd_out = vtd_res.to_lowercase();
    let vtd_input = if vtd_out == "present" || vtd_out == "absent" {
        RequirementInput {
            detected: Some(vtd_out == "present"),
            expected_truthy: false,
            evidence_level: EvidenceLevel::Heuristic,
            source: "ACPI DMAR table heuristic".into(),
        }
    } else {
        RequirementInput {
            detected: None,
            expected_truthy: false,
            evidence_level: EvidenceLevel::None,
            source: "ACPI DMAR table not accessible".into(),
        }
    };

    // ── Above 4G -- not readable from Windows userspace ──
    let above4g_input = RequirementInput {
        detected: None,
        expected_truthy: true,
        evidence_level: EvidenceLevel::None,
        source: "not detectable from Windows userspace".into(),
    };

    // ── BIOS identity ──
    let (mut vendor, mut version, mut release_date) =
        ("Unknown".to_string(), "Unknown".to_string(), "Unknown".to_string());
    if let Ok(bios) = serde_json::from_str::<serde_json::Value>(&bios_res) {
        if let Some(m) = bios.get("Manufacturer").and_then(|v| v.as_str()) {
            vendor = m.to_string();
        }
        if let Some(v) = bios.get("SMBIOSBIOSVersion").and_then(|v| v.as_str()) {
            version = v.to_string();
        }
        if let Some(d) = bios.get("ReleaseDate").and_then(|v| v.as_str()) {
            if d.len() >= 8 {
                release_date = format!("{}-{}-{}", &d[..4], &d[4..6], &d[6..8]);
            }
        }
    }

    let checks = build_firmware_checks(
        Some(&uefi_input),
        Some(&sb_input),
        Some(&vtx_input),
        Some(&vtd_input),
        Some(&above4g_input),
        false,
    );

    let auth_count = checks
        .iter()
        .filter(|c| c.status == "confirmed" || c.status == "failing")
        .count();
    let confidence = if auth_count >= 3 {
        "high"
    } else if auth_count >= 1 {
        "medium"
    } else {
        "low"
    };

    info!(confidence = %confidence, "Windows firmware probe complete");

    Ok(FirmwareReport {
        uefi_mode: checks[0].clone(),
        secure_boot: checks[1].clone(),
        vt_x: checks[2].clone(),
        vt_d: checks[3].clone(),
        above_4g: checks[4].clone(),
        bios_vendor: Some(vendor),
        bios_version: Some(version),
        confidence: confidence.into(),
    })
}

// ── Linux ────────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
async fn probe_firmware_linux() -> Result<FirmwareReport, AppError> {
    info!("Running Linux firmware probe");

    let (dmidecode_res, bootctl_res, lscpu_res, proc_cpuinfo_res, dmesg_dmar_res, dmesg_above4g_res) = tokio::join!(
        run_probe("dmidecode -t bios 2>/dev/null", 5000),
        run_probe("bootctl status 2>/dev/null", 5000),
        run_probe("lscpu 2>/dev/null", 5000),
        run_probe("grep -m1 'flags' /proc/cpuinfo 2>/dev/null", 5000),
        run_probe("dmesg 2>/dev/null | grep -iE 'DMAR|IOMMU enabled|AMD-Vi' | head -5", 5000),
        run_probe("dmesg 2>/dev/null | grep -iE 'above 4G|above4g' | head -3", 5000),
    );

    // ── UEFI mode -- /sys/firmware/efi ──
    let efi_dir_exists = std::path::Path::new("/sys/firmware/efi").exists();
    let uefi_input = RequirementInput {
        detected: Some(efi_dir_exists),
        expected_truthy: true,
        evidence_level: EvidenceLevel::Authoritative,
        source: "/sys/firmware/efi presence".into(),
    };

    // ── Secure Boot -- bootctl ──
    let bootctl_lower = bootctl_res.to_lowercase();
    let (sb_detected, sb_source) = if bootctl_lower.contains("secure boot: enabled") {
        (Some(true), "bootctl status")
    } else if bootctl_lower.contains("secure boot: disabled")
        || bootctl_lower.contains("secure boot: not enabled")
    {
        (Some(false), "bootctl status")
    } else if bootctl_lower.contains("secure boot:") {
        (Some(false), "bootctl status (not-enabled state)")
    } else {
        (None, "bootctl not available")
    };
    let sb_input = RequirementInput {
        detected: sb_detected,
        expected_truthy: false,
        evidence_level: if sb_detected.is_some() {
            EvidenceLevel::Authoritative
        } else {
            EvidenceLevel::None
        },
        source: sb_source.into(),
    };

    // ── VT-x / AMD-V -- CPU flags ──
    let lscpu_out = &lscpu_res;
    let cpuflags_lower = proc_cpuinfo_res.to_lowercase();
    let vtx_supported = lscpu_out.contains("VT-x")
        || lscpu_out.contains("AMD-V")
        || lscpu_out.to_lowercase().contains("vmx")
        || lscpu_out.to_lowercase().contains("svm")
        || cpuflags_lower.contains(" vmx ")
        || cpuflags_lower.contains(" svm ");

    let vtx_input = if !lscpu_out.is_empty() || !cpuflags_lower.is_empty() {
        RequirementInput {
            detected: Some(vtx_supported),
            expected_truthy: true,
            evidence_level: EvidenceLevel::Authoritative,
            source: "lscpu / /proc/cpuinfo CPU flags (capability, not BIOS state)".into(),
        }
    } else {
        RequirementInput {
            detected: None,
            expected_truthy: true,
            evidence_level: EvidenceLevel::None,
            source: "lscpu not available".into(),
        }
    };

    // ── VT-d / IOMMU -- dmesg heuristic ──
    let dmar_lower = dmesg_dmar_res.to_lowercase();
    let vtd_input = if !dmar_lower.trim().is_empty() {
        RequirementInput {
            detected: Some(true),
            expected_truthy: false,
            evidence_level: EvidenceLevel::Heuristic,
            source: "dmesg DMAR/IOMMU heuristic".into(),
        }
    } else {
        RequirementInput {
            detected: None,
            expected_truthy: false,
            evidence_level: EvidenceLevel::None,
            source: "no DMAR/IOMMU entries in dmesg".into(),
        }
    };

    // ── Above 4G -- dmesg heuristic ──
    let above4g_lower = dmesg_above4g_res.to_lowercase();
    let above4g_input = if !above4g_lower.trim().is_empty() {
        RequirementInput {
            detected: Some(true),
            expected_truthy: true,
            evidence_level: EvidenceLevel::Heuristic,
            source: "dmesg above-4G-decoding heuristic".into(),
        }
    } else {
        RequirementInput {
            detected: None,
            expected_truthy: true,
            evidence_level: EvidenceLevel::None,
            source: "not detectable from Linux userspace".into(),
        }
    };

    // ── BIOS identity ──
    let mut vendor = "Unknown".to_string();
    let mut version = "Unknown".to_string();
    let dmi = &dmidecode_res;
    if let Some(caps) = regex::Regex::new(r"Vendor:\s*(.+)")
        .ok()
        .and_then(|re| re.captures(dmi))
    {
        vendor = caps[1].trim().to_string();
    }
    if let Some(caps) = regex::Regex::new(r"Version:\s*(.+)")
        .ok()
        .and_then(|re| re.captures(dmi))
    {
        version = caps[1].trim().to_string();
    }

    let checks = build_firmware_checks(
        Some(&uefi_input),
        Some(&sb_input),
        Some(&vtx_input),
        Some(&vtd_input),
        Some(&above4g_input),
        false,
    );

    let auth_count = checks
        .iter()
        .filter(|c| c.status == "confirmed" || c.status == "failing")
        .count();
    let confidence = if auth_count >= 3 {
        "high"
    } else if auth_count >= 1 {
        "medium"
    } else {
        "low"
    };

    info!(confidence = %confidence, "Linux firmware probe complete");

    Ok(FirmwareReport {
        uefi_mode: checks[0].clone(),
        secure_boot: checks[1].clone(),
        vt_x: checks[2].clone(),
        vt_d: checks[3].clone(),
        above_4g: checks[4].clone(),
        bios_vendor: Some(vendor),
        bios_version: Some(version),
        confidence: confidence.into(),
    })
}

// ── macOS ────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
async fn probe_firmware_mac() -> Result<FirmwareReport, AppError> {
    info!("Running macOS firmware probe (not_applicable for Hackintosh requirements)");

    let boot_rom_res = run_probe(
        "system_profiler SPHardwareDataType 2>/dev/null | grep 'Boot ROM'",
        5000,
    )
    .await;

    let version = boot_rom_res
        .lines()
        .find(|l| l.contains("Boot ROM"))
        .and_then(|l| l.split(':').nth(1))
        .map(|v| v.trim().to_string())
        .unwrap_or_else(|| "Unknown".into());

    let checks = build_firmware_checks(None, None, None, None, None, true);

    info!("macOS firmware probe complete (not_applicable)");

    Ok(FirmwareReport {
        uefi_mode: checks[0].clone(),
        secure_boot: checks[1].clone(),
        vt_x: checks[2].clone(),
        vt_d: checks[3].clone(),
        above_4g: checks[4].clone(),
        bios_vendor: Some("Apple".into()),
        bios_version: Some(version),
        confidence: "not_applicable".into(),
    })
}
