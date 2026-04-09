//! EFI build, validation, and compatibility commands.

use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tracing::{error, info};
use zip::ZipArchive;

use crate::contracts::*;
use crate::domain::compatibility;
use crate::domain::config_generator;
use crate::domain::config_validator;
use crate::domain::kext_policy::{is_optional_kext, kext_registry_entry, KextRegistryEntry};
use crate::domain::ssdt_policy::{
    get_ssdt_download_candidates, get_unsupported_ssdt_requests, is_optional_ssdt,
};
use crate::error::AppError;
use crate::tasks::registry::TaskRegistry;

#[derive(Debug, Clone)]
struct ResolvedKextAsset {
    version: String,
    download_url: String,
    source: &'static str,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseResponse {
    tag_name: Option<String>,
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

fn build_http_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .user_agent("OpCore-OneClick/4.0.0")
        .build()
        .map_err(AppError::from)
}

async fn resolve_kext_asset(
    client: &reqwest::Client,
    entry: &KextRegistryEntry,
    release_cache: &mut HashMap<String, ResolvedKextAsset>,
) -> Result<ResolvedKextAsset, AppError> {
    if let Some(url) = &entry.direct_url {
        return Ok(ResolvedKextAsset {
            version: entry
                .static_version
                .clone()
                .unwrap_or_else(|| "direct".to_string()),
            download_url: url.clone(),
            source: "direct",
        });
    }

    let cache_key = format!(
        "{}#{}",
        entry.repo,
        entry.asset_filter.as_deref().unwrap_or_default()
    );
    if let Some(cached) = release_cache.get(&cache_key) {
        return Ok(cached.clone());
    }

    let release_url = format!("https://api.github.com/repos/{}/releases/latest", entry.repo);
    let release = client
        .get(release_url)
        .send()
        .await?
        .error_for_status()?
        .json::<GitHubReleaseResponse>()
        .await?;

    let matching_asset = release
        .assets
        .iter()
        .find(|asset| {
            asset.name.ends_with(".zip")
                && entry
                    .asset_filter
                    .as_deref()
                    .map(|filter| asset.name.to_uppercase().contains(&filter.to_uppercase()))
                    .unwrap_or(true)
        })
        .or_else(|| release.assets.iter().find(|asset| asset.name.ends_with(".zip")))
        .ok_or_else(|| {
            AppError::new(
                "KEXT_ASSET_NOT_FOUND",
                format!("No zip archive found for {}", entry.repo),
            )
        })?;

    let resolved = ResolvedKextAsset {
        version: release
            .tag_name
            .unwrap_or_else(|| "latest".to_string()),
        download_url: matching_asset.browser_download_url.clone(),
        source: "github",
    };
    release_cache.insert(cache_key, resolved.clone());
    Ok(resolved)
}

async fn download_kext_archive(
    client: &reqwest::Client,
    download_url: &str,
    archive_cache: &mut HashMap<String, Arc<Vec<u8>>>,
) -> Result<Arc<Vec<u8>>, AppError> {
    if let Some(cached) = archive_cache.get(download_url) {
        return Ok(Arc::clone(cached));
    }

    let bytes = client
        .get(download_url)
        .header(reqwest::header::ACCEPT, "application/octet-stream")
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    let archive = Arc::new(bytes.to_vec());
    archive_cache.insert(download_url.to_string(), Arc::clone(&archive));
    Ok(archive)
}

fn relative_bundle_path(entry_path: &Path, kext_name: &str) -> Option<PathBuf> {
    let parts: Vec<String> = entry_path
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();

    let bundle_index = parts
        .iter()
        .position(|part| part.eq_ignore_ascii_case(kext_name))?;

    let mut relative = PathBuf::from(kext_name);
    for part in &parts[bundle_index + 1..] {
        relative.push(part);
    }
    Some(relative)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let entry_type = entry.file_type()?;
        let target = dst.join(entry.file_name());
        if entry_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn validate_kext_bundle(bundle_path: &Path) -> bool {
    let info_plist = bundle_path.join("Contents").join("Info.plist");
    let macos_dir = bundle_path.join("Contents").join("MacOS");

    if !info_plist.exists() {
        return false;
    }

    if !macos_dir.exists() {
        return std::fs::read_to_string(info_plist)
            .map(|content| content.contains("<plist") && content.contains("CFBundleIdentifier"))
            .unwrap_or(false);
    }

    match std::fs::read_dir(macos_dir) {
        Ok(entries) => entries.flatten().any(|entry| {
            entry.metadata().map(|metadata| metadata.is_file() && metadata.len() > 1024).unwrap_or(false)
        }),
        Err(_) => false,
    }
}

fn extract_kext_archive_to_dir(
    archive_bytes: &[u8],
    kext_name: &str,
    kexts_dir: &Path,
) -> Result<(), AppError> {
    let final_dir = kexts_dir.join(kext_name);
    let staging_dir = kexts_dir.join(format!("{}.staging", kext_name));

    if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir)?;
    }
    std::fs::create_dir_all(&staging_dir)?;

    let cursor = Cursor::new(archive_bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|err| {
        AppError::new(
            "ZIP_OPEN_FAILED",
            format!("Failed to open archive for {}: {}", kext_name, err),
        )
    })?;

    let mut matched_files = 0usize;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| {
            AppError::new(
                "ZIP_ENTRY_FAILED",
                format!("Failed to read archive entry for {}: {}", kext_name, err),
            )
        })?;

        let entry_path = file
            .enclosed_name()
            .unwrap_or_else(|| PathBuf::from(file.name()));
        let Some(relative_path) = relative_bundle_path(&entry_path, kext_name) else {
            continue;
        };

        let output_path = staging_dir.join(relative_path);
        matched_files += 1;

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&output_path)?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut output_file = std::fs::File::create(&output_path)?;
        std::io::copy(&mut file, &mut output_file)?;
    }

    if matched_files == 0 {
        std::fs::remove_dir_all(&staging_dir).ok();
        return Err(AppError::new(
            "KEXT_BUNDLE_MISSING",
            format!("Archive did not contain {}", kext_name),
        ));
    }

    let staged_bundle = staging_dir.join(kext_name);
    if !validate_kext_bundle(&staged_bundle) {
        std::fs::remove_dir_all(&staging_dir).ok();
        return Err(AppError::new(
            "KEXT_INVALID",
            format!("Extracted {} failed bundle validation", kext_name),
        ));
    }

    if final_dir.exists() {
        std::fs::remove_dir_all(&final_dir)?;
    }

    match std::fs::rename(&staged_bundle, &final_dir) {
        Ok(_) => {
            std::fs::remove_dir_all(&staging_dir).ok();
        }
        Err(_) => {
            copy_dir_recursive(&staged_bundle, &final_dir)?;
            std::fs::remove_dir_all(&staging_dir).ok();
        }
    }

    Ok(())
}

async fn fetch_kext_bundle(
    client: &reqwest::Client,
    kext_name: &str,
    kexts_dir: &Path,
    release_cache: &mut HashMap<String, ResolvedKextAsset>,
    archive_cache: &mut HashMap<String, Arc<Vec<u8>>>,
) -> Result<KextResult, AppError> {
    let entry = kext_registry_entry(kext_name).ok_or_else(|| {
        AppError::new(
            "KEXT_REGISTRY_MISSING",
            format!("No download source configured for {}", kext_name),
        )
    })?;

    let resolved = resolve_kext_asset(client, &entry, release_cache).await?;
    let archive_bytes = download_kext_archive(client, &resolved.download_url, archive_cache).await?;
    let kext_name_owned = kext_name.to_string();
    let kexts_dir_owned = kexts_dir.to_path_buf();
    let archive_for_extract = Arc::clone(&archive_bytes);

    tokio::task::spawn_blocking(move || {
        extract_kext_archive_to_dir(
            archive_for_extract.as_slice(),
            &kext_name_owned,
            &kexts_dir_owned,
        )
    })
    .await
    .map_err(|err| AppError::new("KEXT_EXTRACT_TASK_FAILED", err.to_string()))??;

    Ok(KextResult {
        name: kext_name.to_string(),
        version: Some(resolved.version),
        source: resolved.source.to_string(),
        status: KextStatus::Downloaded,
    })
}

async fn fetch_latest_release(
    client: &reqwest::Client,
    repo: &str,
) -> Result<GitHubReleaseResponse, AppError> {
    let release_url = format!("https://api.github.com/repos/{repo}/releases/latest");
    client
        .get(release_url)
        .send()
        .await?
        .error_for_status()?
        .json::<GitHubReleaseResponse>()
        .await
        .map_err(AppError::from)
}

async fn download_bytes(
    client: &reqwest::Client,
    url: &str,
    accept_octet_stream: bool,
) -> Result<Vec<u8>, AppError> {
    let mut request = client.get(url);
    if accept_octet_stream {
        request = request.header(reqwest::header::ACCEPT, "application/octet-stream");
    }

    request
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(AppError::from)
}

fn normalize_archive_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn extract_opencore_layout_to_dir(archive_bytes: &[u8], efi_dir: &Path) -> Result<(), AppError> {
    let staging_dir = efi_dir
        .parent()
        .unwrap_or(efi_dir)
        .join("EFI.opencore.staging");

    if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir)?;
    }
    std::fs::create_dir_all(&staging_dir)?;

    let cursor = Cursor::new(archive_bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|err| {
        AppError::new(
            "ZIP_OPEN_FAILED",
            format!("Failed to open OpenCore archive: {err}"),
        )
    })?;

    let mut extracted_entries = 0usize;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| {
            AppError::new(
                "ZIP_ENTRY_FAILED",
                format!("Failed to read OpenCore archive entry: {err}"),
            )
        })?;

        let entry_path = file
            .enclosed_name()
            .unwrap_or_else(|| PathBuf::from(file.name()));
        let normalized = normalize_archive_path(&entry_path);
        let Some(relative) = normalized.strip_prefix("X64/EFI/") else {
            continue;
        };

        let output_path = staging_dir.join(relative);
        extracted_entries += 1;

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&output_path)?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut output_file = std::fs::File::create(&output_path)?;
        std::io::copy(&mut file, &mut output_file)?;
    }

    if extracted_entries == 0 {
        std::fs::remove_dir_all(&staging_dir).ok();
        return Err(AppError::new(
            "OPENCORE_LAYOUT_MISSING",
            "OpenCore archive did not contain the X64/EFI layout",
        ));
    }

    for required in [
        Path::new("BOOT/BOOTx64.efi"),
        Path::new("OC/OpenCore.efi"),
        Path::new("OC/Drivers/OpenRuntime.efi"),
    ] {
        if !staging_dir.join(required).exists() {
            std::fs::remove_dir_all(&staging_dir).ok();
            return Err(AppError::new(
                "OPENCORE_BINARY_MISSING",
                format!("OpenCore archive is missing {}", required.display()),
            ));
        }
    }

    if efi_dir.exists() {
        std::fs::remove_dir_all(efi_dir)?;
    }

    match std::fs::rename(&staging_dir, efi_dir) {
        Ok(_) => {}
        Err(_) => {
            copy_dir_recursive(&staging_dir, efi_dir)?;
            std::fs::remove_dir_all(&staging_dir).ok();
        }
    }

    Ok(())
}

async fn download_and_extract_opencore(
    client: &reqwest::Client,
    efi_dir: &Path,
) -> Result<String, AppError> {
    let release = fetch_latest_release(client, "acidanthera/OpenCorePkg").await?;
    let version = release
        .tag_name
        .clone()
        .unwrap_or_else(|| "latest".to_string());

    let asset = release
        .assets
        .iter()
        .find(|asset| {
            asset.name.starts_with("OpenCore-")
                && asset.name.ends_with("-RELEASE.zip")
                && asset.name.contains(&version)
        })
        .or_else(|| {
            release
                .assets
                .iter()
                .find(|asset| asset.name.starts_with("OpenCore-") && asset.name.ends_with("-RELEASE.zip"))
        })
        .ok_or_else(|| {
            AppError::new(
                "OPENCORE_ASSET_NOT_FOUND",
                "Latest OpenCorePkg release did not expose a RELEASE zip asset",
            )
        })?;

    let archive_bytes = download_bytes(client, &asset.browser_download_url, true).await?;
    let efi_dir_owned = efi_dir.to_path_buf();
    tokio::task::spawn_blocking(move || extract_opencore_layout_to_dir(&archive_bytes, &efi_dir_owned))
        .await
        .map_err(|err| AppError::new("OPENCORE_EXTRACT_TASK_FAILED", err.to_string()))??;

    Ok(version)
}

async fn download_ssdt_file(
    client: &reqwest::Client,
    requested_file_name: &str,
    acpi_dir: &Path,
) -> Result<(), AppError> {
    let destination = acpi_dir.join(requested_file_name);
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }

    for candidate in get_ssdt_download_candidates(requested_file_name) {
        match download_bytes(client, &candidate.url, false).await {
            Ok(bytes) if !bytes.is_empty() => {
                std::fs::write(&destination, bytes)?;
                return Ok(());
            }
            Ok(_) => continue,
            Err(err) => {
                info!(
                    requested = requested_file_name,
                    candidate = %candidate.file_name,
                    error = %err,
                    "Failed SSDT download candidate"
                );
            }
        }
    }

    Err(AppError::new(
        "SSDT_DOWNLOAD_FAILED",
        format!("Unable to download {requested_file_name} from the compiled SSDT source"),
    ))
}

fn remove_plist_dict_containing(xml: &str, target_value: &str) -> String {
    let mut result = xml.to_string();
    let needle = format!("<string>{target_value}</string>");
    let mut search_from = 0usize;

    loop {
        let Some(relative_idx) = result[search_from..].find(&needle) else {
            break;
        };
        let idx = search_from + relative_idx;

        let mut dict_start = None;
        let mut depth = 0usize;
        let mut i = idx;
        while i > 0 {
            i -= 1;
            if result[i..].starts_with("</dict>") {
                depth += 1;
            } else if result[i..].starts_with("<dict>") {
                if depth == 0 {
                    dict_start = Some(i);
                    break;
                }
                depth -= 1;
            }
        }

        let mut dict_end = None;
        depth = 0;
        let mut j = idx + needle.len();
        while j < result.len() {
            if result[j..].starts_with("<dict>") {
                depth += 1;
                j += "<dict>".len();
                continue;
            }
            if result[j..].starts_with("</dict>") {
                if depth == 0 {
                    dict_end = Some(j + "</dict>".len());
                    break;
                }
                depth -= 1;
                j += "</dict>".len();
                continue;
            }
            j += 1;
        }

        let (Some(dict_start), Some(dict_end)) = (dict_start, dict_end) else {
            search_from = idx + needle.len();
            continue;
        };

        let mut trim_start = dict_start;
        while trim_start > 0 {
            let prior = result.as_bytes()[trim_start - 1] as char;
            if matches!(prior, ' ' | '\t' | '\n' | '\r') {
                trim_start -= 1;
            } else {
                break;
            }
        }

        result.replace_range(trim_start..dict_end, "");
        search_from = trim_start;
    }

    result
}

#[tauri::command]
pub async fn build_efi(
    profile: HardwareProfile,
    target_os: String,
    task_registry: State<'_, Arc<TaskRegistry>>,
    app: AppHandle,
) -> Result<BuildResult, AppError> {
    let (task_id, token) = task_registry.create("efi-build").await;

    task_registry
        .update_progress(&task_id, 0.06, Some("Preparing OpenCore layout...".into()))
        .await;

    // Resolve app data directory for build output
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new("PATH_ERROR", format!("Cannot resolve app data dir: {}", e)))?;
    let build_dir = app_data.join("builds").join(&task_id);
    std::fs::create_dir_all(&build_dir).map_err(|e| {
        let msg = format!("Failed to create build directory: {}", e);
        error!(%msg);
        AppError::new("IO_ERROR", msg)
    })?;

    token.check()?;

    // Derive GPU devices summary for the config generator
    let gpu_devices: Option<Vec<crate::domain::rules::HardwareGpuDeviceSummary>> =
        if !profile.gpu.is_empty() {
            Some(vec![crate::domain::rules::HardwareGpuDeviceSummary {
                name: profile.gpu.clone(),
                vendor_name: Some(profile.gpu_vendor.clone()),
                vendor_id: None,
                device_id: profile.gpu_device_id.clone(),
            }])
        } else {
            None
        };

    // Determine strategy from compatibility (use "canonical" default)
    let strategy = "canonical";

    // Generate config.plist
    let config_xml = config_generator::generate_config_plist(
        &profile.architecture,
        &profile.generation,
        profile.is_laptop,
        false, // is_vm - derived from profile context
        &profile.motherboard,
        &target_os,
        &profile.gpu,
        &gpu_devices,
        profile.smbios.as_deref().unwrap_or("iMac20,1"),
        "", // boot_args_input
        profile.audio_codec.as_deref(),
        None, // audio_layout_id_override
        Some(&profile.input_type),
        profile.wifi_chipset.as_deref(),
        strategy,
        None, // core_count
    );

    let config_xml = match config_xml {
        Ok(xml) => xml,
        Err(e) => {
            error!(error = %e, "Config generation failed");
            task_registry.fail(&task_id, &e.message).await;
            return Err(e);
        }
    };

    let resources = config_generator::get_required_resources(
        &profile.architecture,
        &profile.generation,
        profile.is_laptop,
        &profile.motherboard,
        &target_os,
        &profile.gpu,
        &gpu_devices,
        Some(&profile.input_type),
        profile.wifi_chipset.as_deref(),
    );

    token.check()?;
    task_registry
        .update_progress(&task_id, 0.24, Some("Preparing OpenCore directory structure...".into()))
        .await;

    // Create EFI directory structure
    let efi_base = build_dir.join("EFI");
    let oc_dir = efi_base.join("OC");
    let boot_dir = efi_base.join("BOOT");
    let acpi_dir = oc_dir.join("ACPI");
    let drivers_dir = oc_dir.join("Drivers");
    let kexts_dir = oc_dir.join("Kexts");

    for dir in [&efi_base, &oc_dir, &boot_dir, &acpi_dir, &drivers_dir, &kexts_dir] {
        std::fs::create_dir_all(dir).map_err(|e| {
            let msg = format!("Failed to create EFI subdirectory: {}", e);
            error!(%msg);
            AppError::new("IO_ERROR", msg)
        })?;
    }

    let client = build_http_client()?;
    let mut warnings = Vec::new();
    let mut opencore_version = "manual-install-required".to_string();

    token.check()?;
    task_registry
        .update_progress(&task_id, 0.34, Some("Downloading OpenCorePkg release...".into()))
        .await;

    match download_and_extract_opencore(&client, &efi_base).await {
        Ok(version) => {
            opencore_version = version;
        }
        Err(err) => {
            warnings.push(format!(
                "OpenCore binaries were not downloaded automatically: {}. Add BOOTx64.efi, OpenCore.efi, and OpenRuntime.efi manually if needed.",
                err.message
            ));
        }
    }

    for dir in [&efi_base, &oc_dir, &boot_dir, &acpi_dir, &drivers_dir, &kexts_dir] {
        std::fs::create_dir_all(dir)?;
    }

    token.check()?;
    task_registry
        .update_progress(&task_id, 0.46, Some("Downloading required kexts...".into()))
        .await;

    let mut release_cache = HashMap::new();
    let mut archive_cache = HashMap::new();
    let mut kext_results = Vec::with_capacity(resources.kexts.len());
    let mut required_failures = Vec::new();

    for (index, kext_name) in resources.kexts.iter().enumerate() {
        token.check()?;
        let download_progress = 0.46 + ((index as f64) / (resources.kexts.len().max(1) as f64)) * 0.2;
        task_registry
            .update_progress(
                &task_id,
                download_progress,
                Some(format!(
                    "Downloading kext {} ({}/{})...",
                    kext_name,
                    index + 1,
                    resources.kexts.len()
                )),
            )
            .await;

        match fetch_kext_bundle(
            &client,
            kext_name,
            &kexts_dir,
            &mut release_cache,
            &mut archive_cache,
        )
        .await
        {
            Ok(kext) => kext_results.push(kext),
            Err(err) => {
                let failure = format!("{}: {}", kext_name, err.message);
                warnings.push(failure.clone());
                let status = if is_optional_kext(kext_name) {
                    KextStatus::Optional
                } else {
                    required_failures.push(failure);
                    KextStatus::Failed
                };
                kext_results.push(KextResult {
                    name: kext_name.clone(),
                    version: None,
                    source: "failed".into(),
                    status,
                });
            }
        }
    }

    if !required_failures.is_empty() {
        let message = format!("Required kext downloads failed: {}", required_failures.join("; "));
        task_registry.fail(&task_id, &message).await;
        return Err(
            AppError::new("KEXT_DOWNLOAD_FAILED", message)
                .recoverable()
                .with_suggestion("Check internet access and retry the EFI build."),
        );
    }

    token.check()?;
    task_registry
        .update_progress(&task_id, 0.68, Some("Downloading ACPI tables...".into()))
        .await;

    let unsupported_ssdts = get_unsupported_ssdt_requests(&resources.ssdts);
    if !unsupported_ssdts.is_empty() {
        let message = format!(
            "Unsupported SSDT requests for this profile: {}",
            unsupported_ssdts.join(", ")
        );
        task_registry.fail(&task_id, &message).await;
        return Err(AppError::new("SSDT_SOURCE_UNSUPPORTED", message));
    }

    let mut missing_optional_ssdts = Vec::new();
    let mut required_ssdt_failures = Vec::new();

    for (index, ssdt_name) in resources.ssdts.iter().enumerate() {
        token.check()?;
        let download_progress = 0.68 + ((index as f64) / (resources.ssdts.len().max(1) as f64)) * 0.12;
        task_registry
            .update_progress(
                &task_id,
                download_progress,
                Some(format!(
                    "Downloading ACPI table {} ({}/{})...",
                    ssdt_name,
                    index + 1,
                    resources.ssdts.len()
                )),
            )
            .await;

        match download_ssdt_file(&client, ssdt_name, &acpi_dir).await {
            Ok(()) => {}
            Err(err) => {
                let failure = format!("{ssdt_name}: {}", err.message);
                if is_optional_ssdt(ssdt_name) {
                    warnings.push(format!(
                        "Optional SSDT {ssdt_name} was skipped: {}. Falling back to PS2-safe config.",
                        err.message
                    ));
                    missing_optional_ssdts.push(ssdt_name.clone());
                } else {
                    warnings.push(failure.clone());
                    required_ssdt_failures.push(failure);
                }
            }
        }
    }

    if !required_ssdt_failures.is_empty() {
        let message = format!(
            "Required SSDT downloads failed: {}",
            required_ssdt_failures.join("; ")
        );
        task_registry.fail(&task_id, &message).await;
        return Err(
            AppError::new("SSDT_DOWNLOAD_FAILED", message)
                .recoverable()
                .with_suggestion("Check internet access and retry the EFI build."),
        );
    }

    let mut final_ssdts = resources.ssdts.clone();
    let mut config_xml = config_xml;
    if !missing_optional_ssdts.is_empty() {
        for ssdt in &missing_optional_ssdts {
            config_xml = remove_plist_dict_containing(&config_xml, ssdt);
        }

        if missing_optional_ssdts.iter().any(|ssdt| ssdt == "SSDT-GPIO.aml") {
            for bundle_path in [
                "VoodooI2C.kext",
                "VoodooI2CHID.kext",
                "VoodooI2C.kext/Contents/PlugIns/VoodooI2CHID.kext",
            ] {
                config_xml = remove_plist_dict_containing(&config_xml, bundle_path);
            }

            for kext_dir in [kexts_dir.join("VoodooI2C.kext"), kexts_dir.join("VoodooI2CHID.kext")] {
                if kext_dir.exists() {
                    std::fs::remove_dir_all(&kext_dir).ok();
                }
            }

            warnings.push(
                "Removed VoodooI2C entries from config.plist because SSDT-GPIO.aml was unavailable.".into(),
            );
        }

        final_ssdts.retain(|ssdt| !missing_optional_ssdts.iter().any(|missing| missing == ssdt));
    }

    token.check()?;
    task_registry
        .update_progress(&task_id, 0.84, Some("Writing config.plist...".into()))
        .await;

    // Write config.plist
    let config_plist_path = oc_dir.join("config.plist");
    std::fs::write(&config_plist_path, &config_xml).map_err(|e| {
        let msg = format!("Failed to write config.plist: {}", e);
        error!(%msg);
        AppError::new("IO_ERROR", msg)
    })?;

    token.check()?;
    task_registry
        .update_progress(&task_id, 0.93, Some("Validating generated EFI...".into()))
        .await;

    let validation = config_validator::validate_config_plist_content(&config_xml);
    if validation.overall == "blocked" {
        let issues = validation
            .issues
            .iter()
            .map(|issue| issue.message.clone())
            .collect::<Vec<_>>()
            .join("; ");
        task_registry.fail(&task_id, &issues).await;
        return Err(AppError::new(
            "EFI_VALIDATION_FAILED",
            format!("Generated config.plist failed validation: {}", issues),
        ));
    }

    warnings.extend(
        validation
            .issues
            .iter()
            .filter(|issue| issue.severity == "warning")
            .map(|issue| issue.message.clone()),
    );

    task_registry
        .update_progress(&task_id, 0.97, Some("Finalizing EFI build...".into()))
        .await;

    // Emit build:complete event
    let _ = app.emit("build:complete", serde_json::json!({
        "taskId": task_id,
        "efiPath": build_dir.to_string_lossy(),
    }));

    task_registry.complete(&task_id).await;

    let efi_path_str = build_dir.to_string_lossy().to_string();
    let config_path_str = config_plist_path.to_string_lossy().to_string();

    info!(
        efi_path = %efi_path_str,
        kext_count = kext_results.len(),
        ssdt_count = final_ssdts.len(),
        "EFI build completed"
    );

    Ok(BuildResult {
        efi_path: efi_path_str,
        config_plist_path: config_path_str,
        kexts: kext_results,
        ssdts: final_ssdts,
        opencore_version,
        warnings,
    })
}

#[tauri::command]
pub async fn validate_efi(path: String) -> Result<ValidationResult, AppError> {
    info!(path = %path, "Validating EFI config.plist");

    // Accept either a direct config.plist path or a build directory
    let raw = std::path::Path::new(&path);
    let config_path = if raw.is_dir() {
        raw.join("EFI").join("OC").join("config.plist")
    } else {
        raw.to_path_buf()
    };
    let config_path = &config_path;

    // Read the config.plist content
    let content = tokio::task::spawn_blocking({
        let config_path = config_path.to_path_buf();
        move || {
            std::fs::read_to_string(&config_path).map_err(|e| {
                AppError::new(
                    "IO_ERROR",
                    format!("Failed to read config.plist at {}: {}", config_path.display(), e),
                )
            })
        }
    })
    .await
    .map_err(|e| AppError::new("TASK_ERROR", format!("Validation task failed: {}", e)))??;

    // Run validation
    let result = config_validator::validate_config_plist_content(&content);

    // Map PlistValidationResult to our ValidationResult contract
    let sections_present: Vec<String> = config_validator::REQUIRED_SECTIONS
        .iter()
        .filter(|&&section| {
            let key_tag = format!("<key>{}</key>", section);
            content.contains(&key_tag)
        })
        .map(|s| s.to_string())
        .collect();

    let sections_missing: Vec<String> = config_validator::REQUIRED_SECTIONS
        .iter()
        .filter(|&&section| {
            let key_tag = format!("<key>{}</key>", section);
            !content.contains(&key_tag)
        })
        .map(|s| s.to_string())
        .collect();

    let issues: Vec<ValidationIssue> = result
        .issues
        .iter()
        .map(|issue| ValidationIssue {
            severity: issue.severity.clone(),
            section: issue.component.clone(),
            message: issue.message.clone(),
            path: Some(issue.expected_path.clone()),
        })
        .collect();

    let valid = result.overall == "pass";

    info!(
        valid = valid,
        issue_count = issues.len(),
        "EFI validation complete"
    );

    Ok(ValidationResult {
        valid,
        issues,
        sections_present,
        sections_missing,
    })
}

#[tauri::command]
pub async fn check_compatibility(profile: HardwareProfile) -> Result<CompatibilityReport, AppError> {
    info!(
        cpu = %profile.cpu,
        gpu = %profile.gpu,
        generation = %profile.generation,
        "Checking hardware compatibility"
    );

    let gpu_devices: Option<Vec<crate::domain::rules::HardwareGpuDeviceSummary>> =
        if !profile.gpu.is_empty() {
            Some(vec![crate::domain::rules::HardwareGpuDeviceSummary {
                name: profile.gpu.clone(),
                vendor_name: Some(profile.gpu_vendor.clone()),
                vendor_id: None,
                device_id: profile.gpu_device_id.clone(),
            }])
        } else {
            None
        };

    let target_os = profile.target_os.as_deref().unwrap_or("macOS Sequoia 15");
    let ram_str = format!("{} GB", profile.ram_gb);

    let domain_report = compatibility::check_compatibility(
        &profile.architecture,
        &profile.generation,
        &profile.cpu,
        &profile.gpu,
        &gpu_devices,
        profile.is_laptop,
        false, // is_vm
        &profile.motherboard,
        &ram_str,
        target_os,
        profile.wifi_chipset.as_deref(),
        None, // scan_confidence
    );

    // Map domain CompatibilityReport to contracts CompatibilityReport
    let overall = match domain_report.level {
        compatibility::CompatibilityLevel::Supported => CompatibilityVerdict::Supported,
        compatibility::CompatibilityLevel::Experimental => CompatibilityVerdict::Partial,
        compatibility::CompatibilityLevel::Risky => CompatibilityVerdict::Partial,
        compatibility::CompatibilityLevel::Blocked => CompatibilityVerdict::Unsupported,
    };

    let issues: Vec<CompatibilityIssue> = domain_report
        .warnings
        .iter()
        .map(|w| CompatibilityIssue {
            component: "general".into(),
            severity: "warning".into(),
            message: w.clone(),
            workaround: None,
        })
        .chain(domain_report.errors.iter().map(|e| CompatibilityIssue {
            component: "general".into(),
            severity: "error".into(),
            message: e.clone(),
            workaround: None,
        }))
        .collect();

    let supported_os_versions: Vec<String> = domain_report
        .eligible_versions
        .iter()
        .map(|v| v.name.clone())
        .collect();

    let recommended_os = if domain_report.recommended_version.is_empty() {
        None
    } else {
        Some(domain_report.recommended_version.clone())
    };

    // Derive per-component support from the overall level and errors
    let cpu_supported = !domain_report.errors.iter().any(|e| {
        e.to_lowercase().contains("cpu")
            || e.to_lowercase().contains("apple silicon")
            || e.to_lowercase().contains("pentium")
            || e.to_lowercase().contains("celeron")
    });
    let gpu_supported = !domain_report.errors.iter().any(|e| {
        e.to_lowercase().contains("gpu")
            || e.to_lowercase().contains("display path")
    });

    // Confidence from domain report
    let confidence: f64 = match domain_report.confidence.as_str() {
        "high" => 0.9,
        "medium" => 0.6,
        _ => 0.3,
    };

    info!(
        overall = ?overall,
        issue_count = issues.len(),
        "Compatibility check complete"
    );

    Ok(CompatibilityReport {
        overall,
        cpu_supported,
        gpu_supported,
        audio_supported: true, // Audio rarely blocks
        network_supported: true,
        recommended_os,
        supported_os_versions,
        issues,
        confidence,
    })
}
