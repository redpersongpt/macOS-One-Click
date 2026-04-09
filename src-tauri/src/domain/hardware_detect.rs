//! Hardware detection orchestrator.
//! Delegates to platform-specific scanners based on compile-time target_os.

use tracing::info;

use crate::contracts::DetectedHardware;
use crate::error::AppError;
use crate::tasks::cancellation::CancellationToken;

/// Detect hardware on the current platform.
/// Uses platform-specific scanners (PowerShell on Windows, lspci/dmidecode on Linux).
/// Implements tiered scanning with timeouts (25s tier 1, 20s tier 2 on Windows).
pub async fn detect_hardware(token: &CancellationToken) -> Result<DetectedHardware, AppError> {
    token.check()?;

    info!("Starting hardware detection");

    #[cfg(target_os = "windows")]
    {
        detect_windows(token).await
    }

    #[cfg(target_os = "linux")]
    {
        detect_linux(token).await
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "Hardware detection is only supported on Windows and Linux",
        ))
    }
}

#[cfg(target_os = "windows")]
async fn detect_windows(token: &CancellationToken) -> Result<DetectedHardware, AppError> {
    token.check()?;
    info!("Delegating to Windows scanner");
    crate::platform::windows::scanner::scan().await
}

#[cfg(target_os = "linux")]
async fn detect_linux(token: &CancellationToken) -> Result<DetectedHardware, AppError> {
    token.check()?;
    info!("Delegating to Linux scanner");
    crate::platform::linux::scanner::scan().await
}
