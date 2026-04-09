use std::sync::Arc;

use tauri::State;
use tokio::sync::RwLock;

use crate::contracts::PersistedState;
use crate::error::AppError;

pub struct AppStateManager {
    state: RwLock<PersistedState>,
    path: std::path::PathBuf,
}

impl AppStateManager {
    pub fn new(app_data_dir: std::path::PathBuf) -> Arc<Self> {
        let state_path = app_data_dir.join("app_state.json");
        let state = if state_path.exists() {
            match std::fs::read_to_string(&state_path) {
                Ok(content) => {
                    let parsed: PersistedState =
                        serde_json::from_str(&content).unwrap_or_default();
                    // Auto-clear if older than 24 hours
                    if let Some(ts) = parsed.timestamp {
                        let now = chrono::Utc::now().timestamp();
                        if now - ts > 86400 {
                            PersistedState::default()
                        } else {
                            parsed
                        }
                    } else {
                        parsed
                    }
                }
                Err(_) => PersistedState::default(),
            }
        } else {
            PersistedState::default()
        };

        Arc::new(Self {
            state: RwLock::new(state),
            path: state_path,
        })
    }

    async fn persist(&self) -> Result<(), AppError> {
        let state = self.state.read().await;
        let content = serde_json::to_string_pretty(&*state)?;
        std::fs::write(&self.path, content)?;
        Ok(())
    }
}

#[tauri::command]
pub async fn get_persisted_state(
    manager: State<'_, Arc<AppStateManager>>,
) -> Result<PersistedState, AppError> {
    let state = manager.state.read().await;
    Ok(state.clone())
}

#[tauri::command]
pub async fn save_state(
    manager: State<'_, Arc<AppStateManager>>,
    state: PersistedState,
) -> Result<(), AppError> {
    let mut current = manager.state.write().await;
    *current = PersistedState {
        timestamp: Some(chrono::Utc::now().timestamp()),
        ..state
    };
    drop(current);
    manager.persist().await
}

#[tauri::command]
pub async fn clear_state(
    manager: State<'_, Arc<AppStateManager>>,
) -> Result<(), AppError> {
    let mut current = manager.state.write().await;
    *current = PersistedState::default();
    drop(current);
    manager.persist().await
}
