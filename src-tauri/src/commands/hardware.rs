use std::sync::Arc;

use tauri::State;

use crate::contracts::DetectedHardware;
use crate::domain::hardware_detect;
use crate::error::AppError;
use crate::tasks::registry::TaskRegistry;

#[tauri::command]
pub async fn scan_hardware(
    task_registry: State<'_, Arc<TaskRegistry>>,
) -> Result<DetectedHardware, AppError> {
    let (task_id, token) = task_registry.create("hardware-scan").await;

    task_registry
        .update_progress(&task_id, 0.1, Some("Starting hardware detection...".into()))
        .await;

    let result = hardware_detect::detect_hardware(&token).await;

    match &result {
        Ok(_) => {
            task_registry.complete(&task_id).await;
        }
        Err(e) => {
            task_registry.fail(&task_id, &e.message).await;
        }
    }

    result
}
