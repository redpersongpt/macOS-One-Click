import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { AppUpdateState } from '../electron/appUpdater.js';
import { APP_UPDATE_REFRESH_INTERVAL_MS, shouldRefreshAppUpdateState } from '../src/lib/updateState.js';

function makeState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    currentVersion: '2.4.3',
    checking: false,
    downloading: false,
    installing: false,
    lastCheckedAt: null,
    available: false,
    supported: true,
    latestVersion: null,
    releaseUrl: null,
    releaseNotes: null,
    assetName: null,
    assetSize: null,
    downloadedBytes: 0,
    totalBytes: null,
    downloadedPath: null,
    readyToInstall: false,
    restartRequired: false,
    error: null,
    ...overrides,
  };
}

describe('updateState', () => {
  test('polls update status only while a check, download, or install is active', () => {
    assert.equal(shouldRefreshAppUpdateState(makeState()), false);
    assert.equal(shouldRefreshAppUpdateState(makeState({ checking: true })), true);
    assert.equal(shouldRefreshAppUpdateState(makeState({ downloading: true })), true);
    assert.equal(shouldRefreshAppUpdateState(makeState({ installing: true })), true);
    assert.equal(shouldRefreshAppUpdateState(makeState({ readyToInstall: true })), false);
    assert.equal(shouldRefreshAppUpdateState(makeState({ restartRequired: true })), false);
  });

  test('uses the throttled update refresh interval for active updater states', () => {
    assert.equal(APP_UPDATE_REFRESH_INTERVAL_MS, 1500);
  });
});
