import { describe, it, expect } from 'vitest';
import { shouldRefreshAppUpdateState } from '../src/lib/updateState.js';
import type { AppUpdateState } from '../electron/appUpdater.js';

function baseState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    currentVersion: '2.4.4',
    checking: false,
    downloading: false,
    installing: false,
    lastCheckedAt: Date.now(),
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

describe('shouldRefreshAppUpdateState', () => {
  it('returns false for null state', () => {
    expect(shouldRefreshAppUpdateState(null)).toBe(false);
  });

  it('returns false for idle state', () => {
    expect(shouldRefreshAppUpdateState(baseState())).toBe(false);
  });

  it('returns true while checking', () => {
    expect(shouldRefreshAppUpdateState(baseState({ checking: true }))).toBe(true);
  });

  it('returns true while downloading', () => {
    expect(shouldRefreshAppUpdateState(baseState({ downloading: true }))).toBe(true);
  });

  it('returns true while installing', () => {
    expect(shouldRefreshAppUpdateState(baseState({ installing: true }))).toBe(true);
  });

  it('returns false for available-but-idle (waiting for user action)', () => {
    expect(shouldRefreshAppUpdateState(baseState({ available: true }))).toBe(false);
  });

  it('returns false for readyToInstall (no background work)', () => {
    expect(shouldRefreshAppUpdateState(baseState({ readyToInstall: true }))).toBe(false);
  });

  it('returns false for restartRequired (no background work)', () => {
    expect(shouldRefreshAppUpdateState(baseState({ restartRequired: true }))).toBe(false);
  });

  it('returns false for error state', () => {
    expect(shouldRefreshAppUpdateState(baseState({ error: 'Network error' }))).toBe(false);
  });
});
