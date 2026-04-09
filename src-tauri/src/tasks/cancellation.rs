use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::error::AppError;

/// A cancellation token that can be shared across async tasks.
/// When cancelled, any task holding a clone will observe the cancellation.
#[derive(Clone)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Signal cancellation to all holders.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// Check if cancelled. Returns `Err(AppError)` if cancelled.
    pub fn check(&self) -> Result<(), AppError> {
        if self.is_cancelled() {
            Err(AppError::new("TASK_CANCELLED", "Operation was cancelled by user"))
        } else {
            Ok(())
        }
    }

    /// Non-throwing check.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::new()
    }
}
