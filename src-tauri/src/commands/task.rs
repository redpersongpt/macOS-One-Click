use std::sync::Arc;

use tauri::State;

use crate::contracts::TaskUpdate;
use crate::error::AppError;
use crate::tasks::registry::TaskRegistry;

#[tauri::command]
pub async fn task_list(
    registry: State<'_, Arc<TaskRegistry>>,
) -> Result<Vec<TaskUpdate>, AppError> {
    Ok(registry.list().await)
}

#[tauri::command]
pub async fn task_cancel(
    registry: State<'_, Arc<TaskRegistry>>,
    task_id: String,
) -> Result<bool, AppError> {
    Ok(registry.cancel(&task_id).await)
}
