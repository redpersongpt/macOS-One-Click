pub mod commands;
pub mod contracts;
pub mod domain;
pub mod error;
pub mod platform;
pub mod safety;
pub mod tasks;

use tauri::Manager;

use commands::state::AppStateManager;
use safety::flash_auth::FlashSecurityContext;
use tasks::registry::TaskRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize app data directory
            let app_data = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&app_data).ok();

            // State persistence
            let state_manager = AppStateManager::new(app_data);
            app.manage(state_manager);

            // Task registry with watchdog
            let task_registry = TaskRegistry::new(app_handle);
            app.manage(task_registry);

            // Flash security context (HMAC key + session ID)
            let session_id = uuid::Uuid::new_v4().to_string();
            let flash_security = FlashSecurityContext::new(session_id);
            app.manage(flash_security);

            log::info!("OpCore-OneClick v4.0.0 initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Hardware
            commands::hardware::scan_hardware,
            // EFI
            commands::efi::build_efi,
            commands::efi::validate_efi,
            commands::efi::check_compatibility,
            // Disk
            commands::disk::list_usb_devices,
            commands::disk::get_disk_info,
            commands::disk::flash_prepare_confirmation,
            commands::disk::flash_usb,
            // Firmware
            commands::firmware::probe_firmware,
            // Recovery
            commands::recovery::download_recovery,
            commands::recovery::get_cached_recovery_info,
            commands::recovery::clear_recovery_cache,
            // Diagnostics
            commands::diagnostics::log_get_session_id,
            commands::diagnostics::log_get_tail,
            commands::diagnostics::save_support_log,
            commands::diagnostics::clear_app_cache,
            // State
            commands::state::get_persisted_state,
            commands::state::save_state,
            commands::state::clear_state,
            // Tasks
            commands::task::task_list,
            commands::task::task_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
