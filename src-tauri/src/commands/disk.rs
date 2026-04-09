//! Disk enumeration, flash preparation, and flash execution commands.
//! Ported from electron/diskOps.ts + electron/flashSafety.ts.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tracing::{error, info, warn};

use crate::contracts::*;
use crate::error::AppError;
use crate::safety::disk_identity;
use crate::safety::flash_auth::FlashSecurityContext;
use crate::tasks::registry::TaskRegistry;

/// Run a shell command and return stdout.
#[allow(dead_code)]
async fn shell_output(cmd: &str, args: &[&str], timeout_ms: u64) -> Result<String, AppError> {
    let cmd_owned = cmd.to_string();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    let result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        tokio::task::spawn_blocking(move || {
            std::process::Command::new(&cmd_owned)
                .args(&args_owned)
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(output))) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(AppError::new("COMMAND_FAILED", format!("{} failed: {}", cmd, stderr)))
            }
        }
        Ok(Ok(Err(e))) => Err(AppError::new("COMMAND_ERROR", format!("{} error: {}", cmd, e))),
        Ok(Err(e)) => Err(AppError::new("TASK_ERROR", format!("Task panicked: {}", e))),
        Err(_) => Err(AppError::new("TIMEOUT", format!("{} timed out after {}ms", cmd, timeout_ms))),
    }
}

/// Run a PowerShell command and return stdout.
#[cfg(target_os = "windows")]
async fn ps_output(command: &str, timeout_ms: u64) -> Result<String, AppError> {
    shell_output(
        "powershell",
        &["-NoProfile", "-NonInteractive", "-Command", command],
        timeout_ms,
    )
    .await
}

/// Format bytes as human-readable size.
#[allow(dead_code)]
fn format_size(bytes: u64) -> String {
    if bytes >= 1_000_000_000_000 {
        format!("{:.1} TB", bytes as f64 / 1_000_000_000_000.0)
    } else if bytes >= 1_000_000_000 {
        format!("{:.1} GB", bytes as f64 / 1_000_000_000.0)
    } else if bytes >= 1_000_000 {
        format!("{:.1} MB", bytes as f64 / 1_000_000.0)
    } else {
        format!("{} bytes", bytes)
    }
}

// ── list_usb_devices ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_usb_devices() -> Result<Vec<DiskInfo>, AppError> {
    info!("Listing USB devices");

    #[cfg(target_os = "windows")]
    {
        list_usb_windows().await
    }

    #[cfg(target_os = "linux")]
    {
        list_usb_linux().await
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "USB device listing is only supported on Windows and Linux",
        ))
    }
}

#[cfg(target_os = "windows")]
async fn list_usb_windows() -> Result<Vec<DiskInfo>, AppError> {
    let output = ps_output(
        "Get-Disk | Where-Object { $_.BusType -eq 'USB' } | Select-Object Number, FriendlyName, SerialNumber, Size, PartitionStyle, Model | ConvertTo-Json -Compress",
        10000,
    )
    .await?;

    if output.is_empty() || output == "null" {
        return Ok(vec![]);
    }

    let disks: Vec<serde_json::Value> = if output.starts_with('[') {
        serde_json::from_str(&output)?
    } else {
        vec![serde_json::from_str(&output)?]
    };

    let mut results = Vec::new();
    for disk in &disks {
        let number = disk.get("Number").and_then(|v| v.as_u64()).unwrap_or(0);
        let friendly = disk
            .get("FriendlyName")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");
        let serial = disk.get("SerialNumber").and_then(|v| v.as_str()).map(String::from);
        let size = disk.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
        let part_style = disk
            .get("PartitionStyle")
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase());
        let model = disk.get("Model").and_then(|v| v.as_str()).map(String::from);

        // Get partitions for this disk
        let part_cmd = format!(
            "Get-Partition -DiskNumber {} | Select-Object PartitionNumber, DriveLetter, Size, Type | ConvertTo-Json -Compress",
            number
        );
        let part_output = ps_output(&part_cmd, 5000).await.unwrap_or_default();
        let partitions = parse_windows_partitions(&part_output);

        let device_path = format!(r"\\.\PhysicalDrive{}", number);

        results.push(DiskInfo {
            device_path,
            model,
            vendor: None,
            serial_number: serial,
            size_bytes: size,
            size_display: format_size(size),
            transport: Some("USB".into()),
            removable: true,
            partition_table: part_style,
            partitions,
            is_system_disk: false,
        });
    }

    info!(count = results.len(), "Windows USB devices enumerated");
    Ok(results)
}

#[allow(dead_code)]
fn parse_windows_partitions(output: &str) -> Vec<PartitionInfo> {
    if output.is_empty() || output == "null" {
        return vec![];
    }

    let parts: Vec<serde_json::Value> = if output.starts_with('[') {
        serde_json::from_str(output).unwrap_or_default()
    } else {
        serde_json::from_str(output)
            .map(|v: serde_json::Value| vec![v])
            .unwrap_or_default()
    };

    parts
        .iter()
        .map(|p| {
            let number = p
                .get("PartitionNumber")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let drive_letter = p.get("DriveLetter").and_then(|v| v.as_str());
            let size = p.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
            let ptype = p.get("Type").and_then(|v| v.as_str()).map(String::from);

            PartitionInfo {
                number,
                label: ptype,
                filesystem: None,
                size_bytes: size,
                mount_point: drive_letter.map(|l| format!("{}:\\", l)),
            }
        })
        .collect()
}

#[cfg(target_os = "linux")]
async fn list_usb_linux() -> Result<Vec<DiskInfo>, AppError> {
    let output = shell_output(
        "lsblk",
        &["-J", "-b", "-o", "NAME,SIZE,TYPE,TRAN,MODEL,SERIAL,RM,MOUNTPOINT"],
        10000,
    )
    .await?;

    let parsed: serde_json::Value = serde_json::from_str(&output)?;
    let devices = parsed
        .get("blockdevices")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut results = Vec::new();
    for dev in &devices {
        let dtype = dev.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if dtype != "disk" {
            continue;
        }

        let tran = dev.get("tran").and_then(|v| v.as_str()).unwrap_or("");
        if tran != "usb" {
            continue;
        }

        let name = dev.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let model = dev.get("model").and_then(|v| v.as_str()).map(|s| s.trim().to_string());
        let serial = dev.get("serial").and_then(|v| v.as_str()).map(String::from);
        let rm = dev.get("rm").and_then(|v| v.as_bool()).unwrap_or(true);

        // With -b, lsblk returns raw bytes; keep a suffix fallback for safety.
        let size_bytes = dev.get("size").map(parse_lsblk_size_value).unwrap_or(0);

        // Parse partitions
        let children = dev
            .get("children")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let partitions: Vec<PartitionInfo> = children
            .iter()
            .enumerate()
            .filter(|(_, c)| c.get("type").and_then(|v| v.as_str()) == Some("part"))
            .map(|(i, c)| {
                let part_name = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let mount = c.get("mountpoint").and_then(|v| v.as_str()).map(String::from);
                PartitionInfo {
                    number: (i + 1) as u32,
                    label: Some(part_name.to_string()),
                    filesystem: None,
                    size_bytes: c.get("size").map(parse_lsblk_size_value).unwrap_or(0),
                    mount_point: mount,
                }
            })
            .collect();

        let device_path = format!("/dev/{}", name);

        // Check if system disk (any partition mounted at /)
        let is_system = partitions
            .iter()
            .any(|p| p.mount_point.as_deref() == Some("/"));

        results.push(DiskInfo {
            device_path,
            model,
            vendor: None,
            serial_number: serial,
            size_bytes,
            size_display: format_size(size_bytes),
            transport: Some("usb".into()),
            removable: rm,
            partition_table: None, // lsblk doesn't expose this directly
            partitions,
            is_system_disk: is_system,
        });
    }

    info!(count = results.len(), "Linux USB devices enumerated");
    Ok(results)
}

/// Parse lsblk size string (e.g., "14.3G", "512M", "1T") to bytes.
#[allow(dead_code)]
fn parse_lsblk_size(s: &str) -> u64 {
    let s = s.trim();
    if s.is_empty() {
        return 0;
    }
    if let Ok(raw_bytes) = s.parse::<u64>() {
        return raw_bytes;
    }
    let (num_str, suffix) = if s.ends_with('T') || s.ends_with('t') {
        (&s[..s.len() - 1], 1_099_511_627_776u64)
    } else if s.ends_with('G') || s.ends_with('g') {
        (&s[..s.len() - 1], 1_073_741_824)
    } else if s.ends_with('M') || s.ends_with('m') {
        (&s[..s.len() - 1], 1_048_576)
    } else if s.ends_with('K') || s.ends_with('k') {
        (&s[..s.len() - 1], 1_024)
    } else if s.ends_with('B') || s.ends_with('b') {
        (&s[..s.len() - 1], 1)
    } else {
        (s, 1)
    };

    num_str.parse::<f64>().map(|n| (n * suffix as f64) as u64).unwrap_or(0)
}

#[allow(dead_code)]
fn parse_lsblk_size_value(value: &serde_json::Value) -> u64 {
    value
        .as_u64()
        .or_else(|| value.as_str().map(parse_lsblk_size))
        .unwrap_or(0)
}

#[cfg(target_os = "linux")]
async fn ensure_linux_root() -> Result<(), AppError> {
    let uid = shell_output("id", &["-u"], 2000).await?;
    if uid.trim() == "0" {
        Ok(())
    } else {
        Err(AppError::new(
            "ROOT_REQUIRED",
            "Flashing on Linux requires elevated privileges. Re-run the app as root before writing a USB drive.",
        ))
    }
}

// ── get_disk_info ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_disk_info(device: String) -> Result<DiskInfo, AppError> {
    info!(device = %device, "Getting disk info");

    // Reuse the list function and filter
    let all_devices = list_usb_devices().await?;
    let normalized_device = device.trim().to_lowercase();

    all_devices
        .into_iter()
        .find(|d| d.device_path.to_lowercase() == normalized_device)
        .ok_or_else(|| {
            AppError::new(
                "DEVICE_NOT_FOUND",
                format!("USB device {} not found or no longer connected", device),
            )
        })
}

// ── flash_prepare_confirmation ───────────────────────────────────────────────

#[tauri::command]
pub async fn flash_prepare_confirmation(
    device: String,
    efi_path: String,
    security: State<'_, Arc<FlashSecurityContext>>,
) -> Result<FlashConfirmation, AppError> {
    info!(device = %device, efi_path = %efi_path, "Preparing flash confirmation");

    // Probe the target disk
    let disk_info = get_disk_info(device.clone()).await?;

    if disk_info.is_system_disk {
        return Err(AppError::new(
            "SYSTEM_DISK",
            "Cannot flash to a system disk. Select a removable USB device.",
        ));
    }

    // Build disk fingerprint
    let fingerprint = disk_identity::build_fingerprint(&disk_info);

    // Compute EFI state hash (SHA-256 of config.plist content)
    let efi_hash = compute_efi_hash(&efi_path)?;

    // Generate hardware fingerprint (simple platform identifier)
    let hardware_fingerprint = format!(
        "{}:{}:{}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".into())
    );

    // Generate token
    let (token, expires_at) = security.generate_token(
        &device,
        fingerprint,
        &efi_hash,
        None,
        &hardware_fingerprint,
    )?;

    let disk_display = format!(
        "{} ({}) - {}",
        disk_info.model.as_deref().unwrap_or("Unknown"),
        format_size(disk_info.size_bytes),
        disk_info.device_path,
    );

    info!(
        device = %device,
        expires_at = %expires_at,
        "Flash confirmation prepared"
    );

    Ok(FlashConfirmation {
        token,
        device,
        expires_at,
        disk_display,
        efi_hash,
    })
}

/// Compute a SHA-256 hash of the EFI config.plist for state verification.
fn compute_efi_hash(efi_path: &str) -> Result<String, AppError> {
    use sha2::{Digest, Sha256};

    let config_path = std::path::Path::new(efi_path).join("EFI").join("OC").join("config.plist");
    if !config_path.exists() {
        // Try the path itself as a direct config.plist path
        let direct = std::path::Path::new(efi_path);
        if direct.exists() && direct.is_file() {
            let content = std::fs::read(direct)?;
            let hash = Sha256::digest(&content);
            return Ok(format!("{:x}", hash));
        }
        return Err(AppError::new(
            "EFI_INVALID",
            "config.plist not found in EFI structure",
        ));
    }

    let content = std::fs::read(&config_path)?;
    let hash = sha2::Sha256::digest(&content);
    Ok(format!("{:x}", hash))
}

// ── flash_usb ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn flash_usb(
    device: String,
    efi_path: String,
    token: String,
    task_registry: State<'_, Arc<TaskRegistry>>,
    security: State<'_, Arc<FlashSecurityContext>>,
    app: AppHandle,
) -> Result<(), AppError> {
    info!(device = %device, efi_path = %efi_path, "Starting USB flash");

    // 1. Validate token
    let claims = security.verify_and_consume(&token).await?;

    // 2. Verify device matches token claims
    if claims.device != device {
        return Err(AppError::new(
            "DEVICE_MISMATCH",
            "Token device does not match the requested flash target.",
        ));
    }

    // 3. Re-probe disk identity and compare fingerprint
    let current_disk = get_disk_info(device.clone()).await?;
    if current_disk.is_system_disk {
        return Err(AppError::new("SYSTEM_DISK", "Cannot flash to a system disk"));
    }

    let current_fingerprint = disk_identity::build_fingerprint(&current_disk);
    let comparison = disk_identity::compare_fingerprints(&claims.disk_fingerprint, &current_fingerprint);
    if !comparison.mismatched_fields.is_empty() {
        warn!(
            mismatched = ?comparison.mismatched_fields,
            "Disk identity changed since confirmation"
        );
        return Err(AppError::new(
            "DISK_IDENTITY_CHANGED",
            format!(
                "Disk identity changed after confirmation. Mismatched: {}",
                comparison.mismatched_fields.join(", ")
            ),
        ));
    }

    // 4. Verify EFI hash hasn't changed
    let current_efi_hash = compute_efi_hash(&efi_path)?;
    if current_efi_hash != claims.efi_state_hash {
        return Err(AppError::new(
            "EFI_CHANGED",
            "EFI contents changed after confirmation. Rebuild and re-confirm.",
        ));
    }

    // 5. Create task for progress tracking
    let (task_id, _cancel_token) = task_registry.create("usb-flash").await;

    // 6. Platform-specific flash
    let flash_result = {
        #[cfg(target_os = "windows")]
        {
            flash_windows(&device, &efi_path, &task_id, &_cancel_token, &task_registry, &app).await
        }

        #[cfg(target_os = "linux")]
        {
            flash_linux(&device, &efi_path, &task_id, &_cancel_token, &task_registry, &app).await
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            Err(AppError::new(
                "UNSUPPORTED_PLATFORM",
                "USB flashing is only supported on Windows and Linux",
            ))
        }
    };

    match flash_result {
        Ok(()) => {
            task_registry.complete(&task_id).await;
            let _ = app.emit("flash:milestone", serde_json::json!({
                "phase": "complete",
                "taskId": task_id,
            }));
            info!(task_id = %task_id, "USB flash completed successfully");
            Ok(())
        }
        Err(e) => {
            error!(task_id = %task_id, error = %e, "USB flash failed");
            task_registry.fail(&task_id, &e.message).await;
            let _ = app.emit("flash:milestone", serde_json::json!({
                "phase": "failed",
                "taskId": task_id,
                "error": e.message,
            }));
            Err(e)
        }
    }
}

// ── Windows Flash ────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
async fn flash_windows(
    device: &str,
    efi_path: &str,
    task_id: &str,
    token: &crate::tasks::cancellation::CancellationToken,
    registry: &Arc<TaskRegistry>,
    app: &AppHandle,
) -> Result<(), AppError> {
    use std::io::Write;

    // Extract disk number from device path (\\.\PhysicalDriveN)
    let disk_number = device
        .rsplit("PhysicalDrive")
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .ok_or_else(|| AppError::new("INVALID_DEVICE", format!("Cannot parse disk number from {}", device)))?;

    // Phase 1: Diskpart - clean, convert GPT, create partition, format FAT32
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "diskpart",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.1, Some("Preparing disk with diskpart...".into()))
        .await;

    // Create diskpart script in a temp file
    let diskpart_script = format!(
        "select disk {}\nclean\nconvert gpt\ncreate partition primary\nformat fs=fat32 quick label=OPENCORE\nassign\nexit",
        disk_number
    );

    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join(format!("diskpart_{}.txt", task_id));
    {
        let mut file = std::fs::File::create(&script_path).map_err(|e| {
            AppError::new("IO_ERROR", format!("Failed to create diskpart script: {}", e))
        })?;
        file.write_all(diskpart_script.as_bytes())?;
    }

    token.check()?;

    let script_path_str = script_path.to_string_lossy().to_string();
    let diskpart_out = shell_output(
        "diskpart",
        &["/s", &script_path_str],
        120000, // 2 minutes
    )
    .await;

    // Clean up script
    let _ = std::fs::remove_file(&script_path);

    diskpart_out.map_err(|e| {
        AppError::new("DISKPART_FAILED", format!("Diskpart failed: {}", e.message))
    })?;

    token.check()?;

    // Phase 2: Find the assigned drive letter
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "finding-volume",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.3, Some("Finding assigned drive letter...".into()))
        .await;

    // Wait a moment for Windows to assign drive letter
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let drive_letter_cmd = format!(
        "Get-Partition -DiskNumber {} | Where-Object {{ $_.DriveLetter }} | Select-Object -First 1 -ExpandProperty DriveLetter",
        disk_number
    );
    let drive_letter = ps_output(&drive_letter_cmd, 10000).await.map_err(|e| {
        AppError::new("DRIVE_LETTER_MISSING", format!("Cannot find drive letter: {}", e.message))
    })?;

    let drive_letter = drive_letter.trim();
    if drive_letter.is_empty() {
        return Err(AppError::new("DRIVE_LETTER_MISSING", "No drive letter assigned after format"));
    }
    let target_root = format!("{}:\\", drive_letter);

    token.check()?;

    // Phase 3: Copy EFI files
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "copy",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.5, Some("Copying EFI files...".into()))
        .await;

    let efi_source = std::path::Path::new(efi_path).join("EFI");
    let target_efi = std::path::Path::new(&target_root).join("EFI");

    copy_directory_recursive(&efi_source, &target_efi)?;

    token.check()?;

    // Phase 4: Verify
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "verify",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.9, Some("Verifying written files...".into()))
        .await;

    let config_target = target_efi.join("OC").join("config.plist");
    if !config_target.exists() {
        return Err(AppError::new(
            "VERIFY_FAILED",
            "Post-write verification failed: config.plist not found on USB",
        ));
    }

    Ok(())
}

// ── Linux Flash ──────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
async fn flash_linux(
    device: &str,
    efi_path: &str,
    task_id: &str,
    token: &crate::tasks::cancellation::CancellationToken,
    registry: &Arc<TaskRegistry>,
    app: &AppHandle,
) -> Result<(), AppError> {
    ensure_linux_root().await?;

    // Phase 1: Partition with fdisk
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "partition",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.1, Some("Partitioning disk...".into()))
        .await;

    // Wipe and create GPT + single EFI partition
    let fdisk_input = "g\nn\n\n\n\nt\n1\nw\n";
    let fdisk_result = tokio::task::spawn_blocking({
        let device = device.to_string();
        let input = fdisk_input.to_string();
        move || {
            let mut child = std::process::Command::new("fdisk")
                .arg(&device)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()?;
            if let Some(stdin) = child.stdin.as_mut() {
                use std::io::Write;
                stdin.write_all(input.as_bytes())?;
            }
            child.wait_with_output()
        }
    })
    .await
    .map_err(|e| AppError::new("TASK_ERROR", format!("fdisk task failed: {}", e)))?
    .map_err(|e| AppError::new("FDISK_FAILED", format!("fdisk failed: {}", e)))?;

    if !fdisk_result.status.success() {
        let stderr = String::from_utf8_lossy(&fdisk_result.stderr);
        return Err(AppError::new("FDISK_FAILED", format!("fdisk error: {}", stderr)));
    }

    token.check()?;

    // Phase 2: Format as FAT32
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "format",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.3, Some("Formatting as FAT32...".into()))
        .await;

    // Determine partition device (e.g., /dev/sdb1 for /dev/sdb)
    let partition_device = if device.contains("nvme") || device.contains("mmcblk") {
        format!("{}p1", device)
    } else {
        format!("{}1", device)
    };

    // Wait for kernel to re-read partition table
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let _ = shell_output("partprobe", &[device], 5000).await;
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    shell_output(
        "mkfs.fat",
        &["-F", "32", "-n", "OPENCORE", &partition_device],
        30000,
    )
    .await
    .map_err(|e| AppError::new("FORMAT_FAILED", format!("mkfs.fat failed: {}", e.message)))?;

    token.check()?;

    // Phase 3: Mount and copy
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "copy",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.5, Some("Mounting and copying EFI files...".into()))
        .await;

    let mount_point = format!("/tmp/opcore_flash_{}", task_id.replace('-', ""));
    std::fs::create_dir_all(&mount_point)?;

    shell_output("mount", &[&partition_device, &mount_point], 10000)
        .await
        .map_err(|e| AppError::new("MOUNT_FAILED", format!("mount failed: {}", e.message)))?;

    let efi_source = std::path::Path::new(efi_path).join("EFI");
    let target_efi = std::path::Path::new(&mount_point).join("EFI");

    let copy_result = copy_directory_recursive(&efi_source, &target_efi);

    // Always unmount, even if copy failed
    let _ = shell_output("sync", &[], 10000).await;
    let umount_result = shell_output("umount", &[&mount_point], 10000).await;
    let _ = std::fs::remove_dir_all(&mount_point);

    copy_result?;
    umount_result.map_err(|e| {
        AppError::new("UMOUNT_FAILED", format!("umount failed: {}", e.message))
    })?;

    token.check()?;

    // Phase 4: Verify
    let _ = app.emit("flash:milestone", serde_json::json!({
        "phase": "verify",
        "taskId": task_id,
    }));
    registry
        .update_progress(task_id, 0.9, Some("Verifying written files...".into()))
        .await;

    // Re-mount briefly to verify
    std::fs::create_dir_all(&mount_point)?;
    shell_output("mount", &["-o", "ro", &partition_device, &mount_point], 10000)
        .await
        .map_err(|e| AppError::new("VERIFY_MOUNT_FAILED", format!("verify mount failed: {}", e.message)))?;

    let config_exists = std::path::Path::new(&mount_point)
        .join("EFI")
        .join("OC")
        .join("config.plist")
        .exists();

    let _ = shell_output("umount", &[&mount_point], 10000).await;
    let _ = std::fs::remove_dir_all(&mount_point);

    if !config_exists {
        return Err(AppError::new(
            "VERIFY_FAILED",
            "Post-write verification failed: config.plist not found on USB",
        ));
    }

    Ok(())
}

/// Recursively copy a directory.
#[allow(dead_code)]
fn copy_directory_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), AppError> {
    if !src.exists() {
        return Err(AppError::new(
            "IO_ERROR",
            format!("Source directory does not exist: {}", src.display()),
        ));
    }

    std::fs::create_dir_all(dst)?;

    for entry in walkdir::WalkDir::new(src).min_depth(1) {
        let entry = entry.map_err(|e| AppError::new("IO_ERROR", format!("Walk error: {}", e)))?;
        let relative = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| AppError::new("IO_ERROR", format!("Path strip error: {}", e)))?;
        let target = dst.join(relative);

        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), &target).map_err(|e| {
                AppError::new(
                    "IO_ERROR",
                    format!("Failed to copy {} -> {}: {}", entry.path().display(), target.display(), e),
                )
            })?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_lsblk_size;

    #[test]
    fn parses_raw_lsblk_bytes() {
        assert_eq!(parse_lsblk_size("16008609792"), 16_008_609_792);
    }

    #[test]
    fn parses_binary_suffixes() {
        assert_eq!(parse_lsblk_size("1K"), 1_024);
        assert_eq!(parse_lsblk_size("1M"), 1_048_576);
        assert_eq!(parse_lsblk_size("1G"), 1_073_741_824);
        assert_eq!(parse_lsblk_size("1T"), 1_099_511_627_776);
    }

    #[test]
    fn parses_json_number_sizes() {
        let value = serde_json::json!(16_008_609_792u64);
        assert_eq!(super::parse_lsblk_size_value(&value), 16_008_609_792);
    }
}
