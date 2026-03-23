import { describe, expect, it } from 'vitest';
import {
  createBaseAppUpdateState,
  createPersistedAppUpdateSession,
  reconcilePersistedAppUpdateState,
  type AppUpdateResultMarker,
  type PersistedAppUpdateSession,
} from '../electron/appUpdater.js';

function baseSession(overrides: Partial<PersistedAppUpdateSession> = {}): PersistedAppUpdateSession {
  return {
    phase: 'downloaded',
    platform: 'win32',
    targetVersion: '2.7.3',
    releaseTag: 'v2.7.3',
    releaseUrl: 'https://github.com/redpersongpt/OpCore-OneClick/releases/tag/v2.7.3',
    releaseNotes: 'Bug fixes',
    assetName: 'OpCore-OneClick.Setup.2.7.3.exe',
    assetSize: 123_456_789,
    downloadedPath: 'C:\\Users\\redperson\\Downloads\\OpCore-OneClick.Setup.2.7.3.exe',
    currentVersionAtDownload: '2.7.2',
    createdAt: '2026-03-23T10:00:00.000Z',
    requestedAt: null,
    ...overrides,
  };
}

function resultMarker(overrides: Partial<AppUpdateResultMarker> = {}): AppUpdateResultMarker {
  return {
    status: 'success',
    version: '2.7.3',
    completedAt: '2026-03-23T10:05:00.000Z',
    message: 'Update installed successfully.',
    ...overrides,
  };
}

describe('appUpdater persistence helpers', () => {
  it('creates a normalized persisted session from the current update state', () => {
    const session = createPersistedAppUpdateSession({
      phase: 'downloaded',
      platform: 'win32',
      currentVersion: '2.7.2',
      latestVersion: 'v2.7.3',
      releaseUrl: 'https://github.com/redpersongpt/OpCore-OneClick/releases/tag/v2.7.3',
      releaseNotes: 'Bug fixes',
      assetName: 'OpCore-OneClick.Setup.2.7.3.exe',
      assetSize: 123_456_789,
      downloadedPath: 'C:\\Users\\redperson\\Downloads\\OpCore-OneClick.Setup.2.7.3.exe',
    });

    expect(session.targetVersion).toBe('2.7.3');
    expect(session.releaseTag).toBe('v2.7.3');
    expect(session.phase).toBe('downloaded');
  });

  it('restores a downloaded update as ready to install on startup', () => {
    const resolution = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.2',
      supported: true,
      session: baseSession(),
      resultMarker: null,
      downloadedFileExists: true,
    });

    expect(resolution.state).toEqual({
      ...createBaseAppUpdateState('2.7.2', true),
      available: true,
      latestVersion: 'v2.7.3',
      releaseUrl: 'https://github.com/redpersongpt/OpCore-OneClick/releases/tag/v2.7.3',
      releaseNotes: 'Bug fixes',
      assetName: 'OpCore-OneClick.Setup.2.7.3.exe',
      assetSize: 123_456_789,
      downloadedBytes: 123_456_789,
      totalBytes: 123_456_789,
      downloadedPath: 'C:\\Users\\redperson\\Downloads\\OpCore-OneClick.Setup.2.7.3.exe',
      readyToInstall: true,
      restartRequired: false,
      error: null,
    });
    expect(resolution.clearSession).toBe(false);
    expect(resolution.clearResultMarker).toBe(false);
  });

  it('keeps a requested install retryable instead of dropping back to download again', () => {
    const resolution = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.2',
      supported: true,
      session: baseSession({
        phase: 'install-requested',
        requestedAt: '2026-03-23T10:01:00.000Z',
      }),
      resultMarker: null,
      downloadedFileExists: true,
    });

    expect(resolution.state.readyToInstall).toBe(true);
    expect(resolution.state.available).toBe(true);
    expect(resolution.state.error).toBe('The previous update install did not complete. Install again to retry.');
  });

  it('clears stale downloaded state once the target version is already installed', () => {
    const resolution = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.3',
      supported: true,
      session: baseSession(),
      resultMarker: null,
      downloadedFileExists: true,
    });

    expect(resolution.state).toEqual(createBaseAppUpdateState('2.7.3', true));
    expect(resolution.clearSession).toBe(true);
    expect(resolution.clearResultMarker).toBe(false);
  });

  it('restores ready-to-install state after a failed install result', () => {
    const resolution = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.2',
      supported: true,
      session: baseSession({
        phase: 'install-requested',
        requestedAt: '2026-03-23T10:01:00.000Z',
      }),
      resultMarker: resultMarker({
        status: 'failed',
        message: 'Installer exited with code 5.',
      }),
      downloadedFileExists: true,
    });

    expect(resolution.state.readyToInstall).toBe(true);
    expect(resolution.state.error).toBe('Installer exited with code 5.');
    expect(resolution.clearResultMarker).toBe(true);
    expect(resolution.clearSession).toBe(false);
  });

  it('treats a success marker plus new version as fully applied and clears persistence', () => {
    const resolution = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.3',
      supported: true,
      session: baseSession(),
      resultMarker: resultMarker(),
      downloadedFileExists: true,
    });

    expect(resolution.state.available).toBe(false);
    expect(resolution.state.readyToInstall).toBe(false);
    expect(resolution.state.latestVersion).toBe('v2.7.3');
    expect(resolution.clearSession).toBe(true);
    expect(resolution.clearResultMarker).toBe(true);
  });

  it('drops a persisted session if the installer file is gone', () => {
    const resolution = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.2',
      supported: true,
      session: baseSession(),
      resultMarker: null,
      downloadedFileExists: false,
    });

    expect(resolution.state).toEqual(createBaseAppUpdateState('2.7.2', true));
    expect(resolution.clearSession).toBe(true);
  });
});

// Regression: app:update-state must not call reconcilePersistedUpdaterState().
// That function clobbers in-memory appUpdateState from disk. During an active
// download there is no session file yet, so a disk-reconcile produces base
// state (downloading:false), wipes progress, and allows a second download to
// start. The IPC handler now returns appUpdateState directly.
//
// This test verifies the pure reconcile helper behaves consistently so the
// regression is well-defined: reconciling with no session and no marker always
// produces base state, which would overwrite any in-progress download state.
describe('app:update-state — no disk reconcile during active operations', () => {
  it('reconcile with no session and no marker produces clean base state', () => {
    const base = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.4',
      supported: true,
      session: null,
      resultMarker: null,
      downloadedFileExists: false,
    });
    // This is the state that would overwrite downloading:true if reconcile
    // were called from the polling handler.
    expect(base.state.downloading).toBe(false);
    expect(base.state.available).toBe(false);
    expect(base.state.readyToInstall).toBe(false);
  });

  it('a failed-install result marker surfaces an error without re-reconciling', () => {
    // After a failed install, createInitialAppUpdateState sets appUpdateState
    // with readyToInstall:true + error. The first app:update-state poll must
    // return that state unchanged, not call reconcile and lose the error.
    const failedResolution = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.4',
      supported: true,
      session: baseSession({ phase: 'install-requested', targetVersion: '2.7.5' }),
      resultMarker: resultMarker({ status: 'failed', version: '2.7.5', message: 'Installer exited with code 1.' }),
      downloadedFileExists: true,
    });
    // State should carry the error from the failed install, not be clean.
    expect(failedResolution.state.error).toBeTruthy();
    expect(failedResolution.state.readyToInstall).toBe(true);
    // If the polling handler called reconcile again after the marker was
    // already consumed, it would see no marker + session → loses the error.
    const secondReconcile = reconcilePersistedAppUpdateState({
      currentVersion: '2.7.4',
      supported: true,
      session: baseSession({ phase: 'install-requested', targetVersion: '2.7.5' }),
      resultMarker: null, // marker already consumed by first reconcile
      downloadedFileExists: true,
    });
    // Error message changes on second reconcile — confirms the state would
    // be different if the IPC handler called reconcile instead of returning
    // appUpdateState directly.
    expect(secondReconcile.state.error).not.toBe(failedResolution.state.error);
  });
});
