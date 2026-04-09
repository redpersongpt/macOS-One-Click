//! macOS recovery image download commands.
//! Ported from electron/appleRecovery.ts + electron/recoveryBoardId.ts.

use std::collections::HashMap;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};
use tracing::{error, info, warn};

use crate::contracts::*;
use crate::error::AppError;
use crate::tasks::registry::TaskRegistry;

// ── Constants ────────────────────────────────────────────────────────────────

const APPLE_RECOVERY_HOST: &str = "osrecovery.apple.com";
const INTERNET_RECOVERY_USER_AGENT: &str = "InternetRecovery/1.0";
const APPLE_RECOVERY_ROOT_URL: &str = "https://osrecovery.apple.com/";
const APPLE_RECOVERY_IMAGE_URL: &str =
    "https://osrecovery.apple.com/InstallationPayload/RecoveryImage";
const APPLE_RECOVERY_MLB_ZERO: &str = "00000000000000000";

/// Maximum retry attempts for download.
const MAX_RETRIES: u32 = 5;

/// Progress event throttle interval.
const PROGRESS_THROTTLE_MS: u64 = 250;

// ── Board ID lookup ──────────────────────────────────────────────────────────

struct BoardIdEntry {
    board_id: &'static str,
    mlb: &'static str,
}

fn recovery_board_ids() -> HashMap<&'static str, BoardIdEntry> {
    let mut map = HashMap::new();
    map.insert("16", BoardIdEntry { board_id: "Mac-827FAC58A8FDFA22", mlb: APPLE_RECOVERY_MLB_ZERO });
    map.insert("15", BoardIdEntry { board_id: "Mac-827FAC58A8FDFA22", mlb: APPLE_RECOVERY_MLB_ZERO });
    map.insert("14", BoardIdEntry { board_id: "Mac-827FAC58A8FDFA22", mlb: APPLE_RECOVERY_MLB_ZERO });
    map.insert("13", BoardIdEntry { board_id: "Mac-4B682C642B45593E", mlb: APPLE_RECOVERY_MLB_ZERO });
    map.insert("12", BoardIdEntry { board_id: "Mac-FFE5EF870D7BA81A", mlb: APPLE_RECOVERY_MLB_ZERO });
    map.insert("11", BoardIdEntry { board_id: "Mac-42FD25EABCABB274", mlb: APPLE_RECOVERY_MLB_ZERO });
    map.insert("10.15", BoardIdEntry { board_id: "Mac-00BE6ED71E35EB86", mlb: APPLE_RECOVERY_MLB_ZERO });
    map.insert("10.14", BoardIdEntry { board_id: "Mac-7BA5B2D9BE2258A1", mlb: "F4K10270Q2J3WLVAD" });
    map.insert("10.13", BoardIdEntry { board_id: "Mac-BE088AF8C5EB4FA2", mlb: "F17M0XA0H7G3F91AD" });
    map
}

/// Resolve version key from a macOS version string like "macOS Sequoia 15".
fn resolve_version_key(macos_version: &str) -> Option<String> {
    let re = regex::Regex::new(r"(\d+(?:\.\d+)?)\s*$").ok()?;
    let extracted = re
        .captures(macos_version)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())?;

    let board_ids = recovery_board_ids();

    // Exact match
    if board_ids.contains_key(extracted.as_str()) {
        return Some(extracted);
    }

    // Major-only match
    let major = extracted.split('.').next().unwrap_or("");
    if board_ids.contains_key(major) {
        return Some(major.to_string());
    }

    // Scan keys longest-first
    let mut keys: Vec<&&str> = board_ids.keys().collect();
    keys.sort_by(|a, b| b.len().cmp(&a.len()).then(b.cmp(a)));
    for key in keys {
        if macos_version.contains(*key) {
            return Some(key.to_string());
        }
    }

    None
}

/// Generate random hex string.
fn random_hex(len: usize) -> String {
    use rand::Rng;
    let bytes_needed = (len + 1) / 2;
    let mut bytes = vec![0u8; bytes_needed];
    rand::rng().fill(&mut bytes[..]);
    let hex: String = bytes.iter().map(|b| format!("{:02X}", b)).collect();
    hex[..len].to_string()
}

// ── Apple Recovery Protocol ──────────────────────────────────────────────────

/// Probe the Apple recovery endpoint and extract session cookie.
async fn probe_endpoint(client: &reqwest::Client) -> Result<String, AppError> {
    let resp = client
        .get(APPLE_RECOVERY_ROOT_URL)
        .header("Host", APPLE_RECOVERY_HOST)
        .header("User-Agent", INTERNET_RECOVERY_USER_AGENT)
        .header("Connection", "close")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?;

    if resp.status().is_server_error() {
        return Err(AppError::new("CONN_ERR", "Apple recovery server unreachable"));
    }

    // Extract session cookie
    let session = resp
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split("; "))
        .find(|part| part.starts_with("session="))
        .map(String::from)
        .ok_or_else(|| AppError::new("APPLE_EMPTY_SESSION", "No session cookie from Apple"))?;

    Ok(session)
}

/// Asset info returned by Apple's recovery server.
struct AssetInfo {
    dmg_url: String,
    dmg_token: String,
    #[allow(dead_code)]
    chunklist_url: String,
    #[allow(dead_code)]
    chunklist_token: String,
}

/// Query Apple for recovery asset URLs.
async fn query_assets(
    client: &reqwest::Client,
    board_id: &str,
    mlb: &str,
    session_cookie: &str,
) -> Result<AssetInfo, AppError> {
    let cid = random_hex(16);
    let k = random_hex(64);
    let fg = random_hex(64);

    let body = format!(
        "cid={}\nsn={}\nbid={}\nk={}\nfg={}\nos=default",
        cid, mlb, board_id, k, fg
    );

    let resp = client
        .post(APPLE_RECOVERY_IMAGE_URL)
        .header("Host", APPLE_RECOVERY_HOST)
        .header("User-Agent", INTERNET_RECOVERY_USER_AGENT)
        .header("Cookie", session_cookie)
        .header("Content-Type", "text/plain")
        .header("Connection", "close")
        .timeout(std::time::Duration::from_secs(15))
        .body(body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if status == 401 || status == 403 {
        return Err(AppError::new(
            "APPLE_AUTH_REJECT",
            format!("Apple rejected auth: {}", status),
        ));
    }
    if status == 429 {
        return Err(AppError::new("APPLE_RATE_LIMIT", "Apple rate limit hit"));
    }
    if status >= 500 {
        return Err(AppError::new(
            "APPLE_SERVER_ERROR",
            format!("Apple server error: {}", status),
        ));
    }
    if status != 200 {
        return Err(AppError::new(
            "APPLE_HTTP",
            format!("Unexpected HTTP status: {}", status),
        ));
    }

    let response_body = resp.text().await?;

    // Parse key-value response
    let mut info: HashMap<String, String> = HashMap::new();
    for line in response_body.lines() {
        if let Some(sep_idx) = line.find(": ") {
            let key = line[..sep_idx].trim().to_string();
            let value = line[sep_idx + 2..].trim().to_string();
            info.insert(key, value);
        }
    }

    let dmg_url = info
        .get("AU")
        .cloned()
        .ok_or_else(|| AppError::new("APPLE_EMPTY_RESPONSE", "Missing DMG URL (AU) in response"))?;
    let dmg_token = info
        .get("AT")
        .cloned()
        .ok_or_else(|| AppError::new("APPLE_EMPTY_RESPONSE", "Missing DMG token (AT)"))?;
    let chunklist_url = info.get("CU").cloned().unwrap_or_default();
    let chunklist_token = info.get("CT").cloned().unwrap_or_default();

    Ok(AssetInfo {
        dmg_url,
        dmg_token,
        chunklist_url,
        chunklist_token,
    })
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn download_recovery(
    target_os: String,
    task_registry: State<'_, Arc<TaskRegistry>>,
    app: AppHandle,
) -> Result<(), AppError> {
    info!(target_os = %target_os, "Starting recovery download");

    let (task_id, cancel_token) = task_registry.create("recovery-download").await;

    task_registry
        .update_progress(&task_id, 0.01, Some("Resolving board ID...".into()))
        .await;

    // Resolve board ID
    let version_key = resolve_version_key(&target_os).ok_or_else(|| {
        AppError::new(
            "UNSUPPORTED_VERSION",
            format!("No recovery board ID for: {}", target_os),
        )
    })?;

    let board_ids = recovery_board_ids();
    let entry = board_ids.get(version_key.as_str()).ok_or_else(|| {
        AppError::new("BOARD_ID_MISSING", "Board ID entry not found")
    })?;

    let board_id = entry.board_id.to_string();
    let mlb = entry.mlb.to_string();

    cancel_token.check()?;
    task_registry
        .update_progress(&task_id, 0.05, Some("Contacting Apple recovery server...".into()))
        .await;

    let client = reqwest::Client::builder()
        .user_agent(INTERNET_RECOVERY_USER_AGENT)
        .build()?;

    // Probe endpoint
    let session_cookie = probe_endpoint(&client).await.map_err(|e| {
        error!(error = %e, "Apple recovery endpoint probe failed");
        e
    })?;

    cancel_token.check()?;
    task_registry
        .update_progress(&task_id, 0.1, Some("Querying recovery assets...".into()))
        .await;

    // Query asset URLs
    let assets = query_assets(&client, &board_id, &mlb, &session_cookie).await?;

    cancel_token.check()?;
    task_registry
        .update_progress(&task_id, 0.15, Some("Starting DMG download...".into()))
        .await;

    // Resolve download destination
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new("PATH_ERROR", format!("Cannot resolve app data dir: {}", e)))?;
    let recovery_dir = app_data.join("recovery");
    std::fs::create_dir_all(&recovery_dir)?;

    let dmg_dest = recovery_dir.join(format!("BaseSystem-{}.dmg", version_key));
    let meta_path = recovery_dir.join("recovery_meta.json");

    // Check for existing partial download (resume support)
    let existing_size = if dmg_dest.exists() {
        std::fs::metadata(&dmg_dest)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    // Download with retry and resume
    let mut attempt = 0u32;
    let mut downloaded = existing_size;

    loop {
        attempt += 1;
        if attempt > MAX_RETRIES {
            let msg = "Recovery download failed after maximum retries";
            error!(%msg);
            task_registry.fail(&task_id, msg).await;
            return Err(AppError::new("DOWNLOAD_FAILED", msg));
        }

        cancel_token.check()?;

        let download_result = download_dmg_with_resume(
            &client,
            &assets.dmg_url,
            &assets.dmg_token,
            &dmg_dest,
            downloaded,
            &task_id,
            &cancel_token,
            &task_registry,
            &app,
        )
        .await;

        match download_result {
            Ok(total) => {
                downloaded = total;
                break;
            }
            Err(e) => {
                warn!(
                    attempt = attempt,
                    error = %e,
                    "Download attempt failed, retrying..."
                );
                // Update downloaded offset for resume
                if dmg_dest.exists() {
                    downloaded = std::fs::metadata(&dmg_dest)
                        .map(|m| m.len())
                        .unwrap_or(0);
                }
                // Exponential backoff
                let delay = std::time::Duration::from_millis(1000 * 2u64.pow(attempt - 1));
                tokio::time::sleep(delay).await;
            }
        }
    }

    cancel_token.check()?;
    task_registry
        .update_progress(&task_id, 0.95, Some("Saving metadata...".into()))
        .await;

    // Save metadata
    let meta = serde_json::json!({
        "osVersion": target_os,
        "versionKey": version_key,
        "dmgPath": dmg_dest.to_string_lossy(),
        "sizeBytes": downloaded,
        "downloadedAt": chrono::Utc::now().to_rfc3339(),
    });
    std::fs::write(&meta_path, serde_json::to_string_pretty(&meta)?)?;

    task_registry.complete(&task_id).await;
    let _ = app.emit("recovery:complete", serde_json::json!({
        "taskId": task_id,
        "osVersion": target_os,
        "dmgPath": dmg_dest.to_string_lossy(),
    }));

    info!(
        target_os = %target_os,
        size = downloaded,
        "Recovery download completed"
    );

    Ok(())
}

/// Download the DMG with Range header resume support and progress events.
async fn download_dmg_with_resume(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    dest: &std::path::Path,
    offset: u64,
    task_id: &str,
    cancel_token: &crate::tasks::cancellation::CancellationToken,
    registry: &Arc<TaskRegistry>,
    app: &AppHandle,
) -> Result<u64, AppError> {
    use tokio::io::AsyncWriteExt;

    let mut req = client
        .get(url)
        .header("User-Agent", INTERNET_RECOVERY_USER_AGENT)
        .header("Cookie", format!("AssetToken={}", token))
        .timeout(std::time::Duration::from_secs(300));

    if offset > 0 {
        req = req.header("Range", format!("bytes={}-", offset));
    }

    let resp = req.send().await?;
    let status = resp.status().as_u16();

    if status != 200 && status != 206 {
        return Err(AppError::new(
            "DOWNLOAD_HTTP_ERROR",
            format!("Download HTTP error: {}", status),
        ));
    }

    let total_size = if status == 206 {
        // Partial content — parse content-range
        resp.headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit('/').next())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0)
    } else {
        resp.content_length().unwrap_or(0)
    };

    // Open file for writing (append if resuming)
    let file = if offset > 0 && status == 206 {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(dest)
            .await?
    } else {
        tokio::fs::File::create(dest).await?
    };

    let mut writer = tokio::io::BufWriter::new(file);
    let mut stream = resp.bytes_stream();
    let mut current = if status == 206 { offset } else { 0u64 };
    let mut last_emit = std::time::Instant::now();

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        cancel_token.check()?;

        let chunk = chunk.map_err(|e| AppError::new("DOWNLOAD_ERROR", e.to_string()))?;
        writer.write_all(&chunk).await?;
        current += chunk.len() as u64;

        // Throttled progress
        if last_emit.elapsed().as_millis() >= PROGRESS_THROTTLE_MS as u128 {
            let progress = if total_size > 0 {
                0.15 + 0.8 * (current as f64 / total_size as f64)
            } else {
                0.5
            };
            registry
                .update_progress(
                    task_id,
                    progress.min(0.94),
                    Some(format!(
                        "Downloading... {} / {}",
                        format_bytes(current),
                        if total_size > 0 {
                            format_bytes(total_size)
                        } else {
                            "unknown".into()
                        }
                    )),
                )
                .await;

            let _ = app.emit("recovery:progress", serde_json::json!({
                "taskId": task_id,
                "downloaded": current,
                "total": total_size,
            }));
            last_emit = std::time::Instant::now();
        }
    }

    writer.flush().await?;
    drop(writer);

    Ok(current)
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_000_000_000 {
        format!("{:.1} GB", bytes as f64 / 1_000_000_000.0)
    } else if bytes >= 1_000_000 {
        format!("{:.1} MB", bytes as f64 / 1_000_000.0)
    } else if bytes >= 1_000 {
        format!("{:.1} KB", bytes as f64 / 1_000.0)
    } else {
        format!("{} B", bytes)
    }
}

#[tauri::command]
pub async fn get_cached_recovery_info(
    app: AppHandle,
) -> Result<RecoveryCacheInfo, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new("PATH_ERROR", format!("Cannot resolve app data dir: {}", e)))?;
    let meta_path = app_data.join("recovery").join("recovery_meta.json");

    if !meta_path.exists() {
        return Ok(RecoveryCacheInfo {
            available: false,
            os_version: None,
            dmg_path: None,
            size_bytes: None,
        });
    }

    let content = std::fs::read_to_string(&meta_path)?;
    let meta: serde_json::Value = serde_json::from_str(&content)?;

    let dmg_path = meta
        .get("dmgPath")
        .and_then(|v| v.as_str())
        .map(String::from);

    // Check if the DMG file still exists
    let file_exists = dmg_path
        .as_ref()
        .map(|p| std::path::Path::new(p).exists())
        .unwrap_or(false);

    if !file_exists {
        return Ok(RecoveryCacheInfo {
            available: false,
            os_version: meta.get("osVersion").and_then(|v| v.as_str()).map(String::from),
            dmg_path: None,
            size_bytes: None,
        });
    }

    let size_bytes = meta.get("sizeBytes").and_then(|v| v.as_u64());

    Ok(RecoveryCacheInfo {
        available: true,
        os_version: meta.get("osVersion").and_then(|v| v.as_str()).map(String::from),
        dmg_path,
        size_bytes,
    })
}

#[tauri::command]
pub async fn clear_recovery_cache(
    app: AppHandle,
) -> Result<(), AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new("PATH_ERROR", format!("Cannot resolve app data dir: {}", e)))?;
    let recovery_dir = app_data.join("recovery");

    if recovery_dir.exists() {
        std::fs::remove_dir_all(&recovery_dir).map_err(|e| {
            AppError::new("IO_ERROR", format!("Failed to clear recovery cache: {}", e))
        })?;
        info!("Recovery cache cleared");
    }

    Ok(())
}
