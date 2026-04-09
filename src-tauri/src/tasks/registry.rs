use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

use crate::contracts::{TaskStatus, TaskUpdate};
use crate::tasks::cancellation::CancellationToken;

/// Tracks all active async operations with progress, cancellation, and watchdog.
pub struct TaskRegistry {
    tasks: RwLock<HashMap<String, TaskState>>,
    tokens: RwLock<HashMap<String, CancellationToken>>,
    app: AppHandle,
}

struct TaskState {
    task_id: String,
    kind: String,
    status: TaskStatus,
    progress: Option<f64>,
    message: Option<String>,
    last_update: Instant,
}

/// Stall thresholds per task kind.
fn stall_threshold(kind: &str) -> Duration {
    match kind {
        "usb-flash" => Duration::from_secs(900),      // 15 min
        "partition-prep" => Duration::from_secs(300),  // 5 min
        "recovery-download" => Duration::from_secs(120), // 2 min
        _ => Duration::from_secs(60),                  // 1 min default
    }
}

impl TaskRegistry {
    pub fn new(app: AppHandle) -> Arc<Self> {
        let registry = Arc::new(Self {
            tasks: RwLock::new(HashMap::new()),
            tokens: RwLock::new(HashMap::new()),
            app,
        });

        // Spawn watchdog using tauri's async runtime (not bare tokio::spawn,
        // because setup() may run before the tokio reactor is active).
        let watchdog = Arc::clone(&registry);
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            loop {
                interval.tick().await;
                watchdog.check_stalled().await;
            }
        });

        registry
    }

    /// Create a new tracked task and return its cancellation token.
    pub async fn create(&self, kind: &str) -> (String, CancellationToken) {
        let task_id = uuid::Uuid::new_v4().to_string();
        let token = CancellationToken::new();
        let now = Instant::now();

        let state = TaskState {
            task_id: task_id.clone(),
            kind: kind.to_string(),
            status: TaskStatus::Running,
            progress: Some(0.0),
            message: None,
            last_update: now,
        };

        self.tasks.write().await.insert(task_id.clone(), state);
        self.tokens.write().await.insert(task_id.clone(), token.clone());

        self.emit_update(&task_id).await;
        (task_id, token)
    }

    /// Update task progress (0.0 - 1.0) with optional message.
    pub async fn update_progress(&self, task_id: &str, progress: f64, message: Option<String>) {
        let mut tasks = self.tasks.write().await;
        if let Some(state) = tasks.get_mut(task_id) {
            state.progress = Some(progress.clamp(0.0, 1.0));
            state.message = message;
            state.last_update = Instant::now();
        }
        drop(tasks);
        self.emit_update(task_id).await;
    }

    /// Mark task as completed.
    pub async fn complete(&self, task_id: &str) {
        let mut tasks = self.tasks.write().await;
        if let Some(state) = tasks.get_mut(task_id) {
            state.status = TaskStatus::Completed;
            state.progress = Some(1.0);
            state.last_update = Instant::now();
        }
        drop(tasks);
        self.emit_update(task_id).await;
        self.tokens.write().await.remove(task_id);
    }

    /// Mark task as failed.
    pub async fn fail(&self, task_id: &str, error: &str) {
        let mut tasks = self.tasks.write().await;
        if let Some(state) = tasks.get_mut(task_id) {
            state.status = TaskStatus::Failed;
            state.message = Some(error.to_string());
            state.last_update = Instant::now();
        }
        drop(tasks);
        self.emit_update(task_id).await;
        self.tokens.write().await.remove(task_id);
    }

    /// Cancel a task by ID.
    pub async fn cancel(&self, task_id: &str) -> bool {
        let tokens = self.tokens.read().await;
        if let Some(token) = tokens.get(task_id) {
            token.cancel();
            drop(tokens);

            let mut tasks = self.tasks.write().await;
            if let Some(state) = tasks.get_mut(task_id) {
                state.status = TaskStatus::Cancelled;
                state.last_update = Instant::now();
            }
            drop(tasks);
            self.emit_update(task_id).await;
            self.tokens.write().await.remove(task_id);
            true
        } else {
            false
        }
    }

    /// List all current tasks.
    pub async fn list(&self) -> Vec<TaskUpdate> {
        let tasks = self.tasks.read().await;
        tasks.values().map(|s| TaskUpdate {
            task_id: s.task_id.clone(),
            kind: s.kind.clone(),
            status: s.status.clone(),
            progress: s.progress,
            message: s.message.clone(),
            detail: None,
        }).collect()
    }

    /// Watchdog: detect stalled tasks.
    async fn check_stalled(&self) {
        let now = Instant::now();
        let mut stalled = Vec::new();

        {
            let tasks = self.tasks.read().await;
            for state in tasks.values() {
                if matches!(state.status, TaskStatus::Running) {
                    let threshold = stall_threshold(&state.kind);
                    if now.duration_since(state.last_update) > threshold {
                        stalled.push(state.task_id.clone());
                    }
                }
            }
        }

        for task_id in stalled {
            log::warn!("Task {} stalled, marking as failed", task_id);
            self.fail(&task_id, "Operation stalled — no progress for too long").await;
        }
    }

    /// Emit a task:update event to the frontend.
    async fn emit_update(&self, task_id: &str) {
        let tasks = self.tasks.read().await;
        if let Some(state) = tasks.get(task_id) {
            let update = TaskUpdate {
                task_id: state.task_id.clone(),
                kind: state.kind.clone(),
                status: state.status.clone(),
                progress: state.progress,
                message: state.message.clone(),
                detail: None,
            };
            let _ = self.app.emit("task:update", &update);
        }
    }
}
