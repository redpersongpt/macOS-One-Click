export interface ReleaseAssetInfo {
  name: string;
  browser_download_url: string;
  size?: number;
}

export interface LatestReleaseInfo {
  tag_name: string;
  html_url: string;
  body?: string;
  assets?: ReleaseAssetInfo[];
}

export interface AppUpdateState {
  currentVersion: string;
  checking: boolean;
  downloading: boolean;
  installing: boolean;
  lastCheckedAt: number | null;
  available: boolean;
  supported: boolean;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  assetName: string | null;
  assetSize: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  downloadedPath: string | null;
  readyToInstall: boolean;
  restartRequired: boolean;
  error: string | null;
}

export type AppUpdateSessionPhase = 'downloaded' | 'install-requested';

export interface PersistedAppUpdateSession {
  phase: AppUpdateSessionPhase;
  platform: NodeJS.Platform;
  targetVersion: string;
  releaseTag: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  assetName: string;
  assetSize: number | null;
  downloadedPath: string;
  currentVersionAtDownload: string;
  createdAt: string;
  requestedAt: string | null;
}

export interface AppUpdateResultMarker {
  status: 'success' | 'failed';
  version: string;
  completedAt: string;
  message: string | null;
}

export interface ReconcilePersistedAppUpdateStateInput {
  currentVersion: string;
  supported: boolean;
  session: PersistedAppUpdateSession | null;
  resultMarker: AppUpdateResultMarker | null;
  downloadedFileExists: boolean;
}

export interface ReconcilePersistedAppUpdateStateResult {
  state: AppUpdateState;
  clearSession: boolean;
  clearResultMarker: boolean;
}

export function normalizeReleaseVersion(version: string): string {
  return version.trim().replace(/^v/i, '').split('-')[0];
}

export function compareReleaseVersions(a: string, b: string): number {
  const left = normalizeReleaseVersion(a).split('.').map((part) => parseInt(part, 10) || 0);
  const right = normalizeReleaseVersion(b).split('.').map((part) => parseInt(part, 10) || 0);
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function pickReleaseAssetForPlatform(
  platform: NodeJS.Platform,
  assets: ReleaseAssetInfo[],
): ReleaseAssetInfo | null {
  if (platform === 'win32') {
    return assets.find((asset) => asset.name.toLowerCase().endsWith('.exe')) ?? null;
  }
  if (platform === 'linux') {
    return assets.find((asset) => asset.name.endsWith('.AppImage'))
      ?? assets.find((asset) => asset.name.endsWith('.deb'))
      ?? null;
  }
  return null;
}

export function isInstallerResidueEntryName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return /macos[-_. ]?installer/.test(normalized)
    || /macossinstaller/.test(normalized)
    || normalized === 'installer'
    || normalized === 'installer-cache';
}

export function createBaseAppUpdateState(currentVersion: string, supported: boolean): AppUpdateState {
  return {
    currentVersion,
    checking: false,
    downloading: false,
    installing: false,
    lastCheckedAt: null,
    available: false,
    supported,
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
  };
}

function buildStateFromPersistedSession(baseState: AppUpdateState, session: PersistedAppUpdateSession): AppUpdateState {
  return {
    ...baseState,
    available: compareReleaseVersions(session.targetVersion, baseState.currentVersion) > 0,
    latestVersion: session.releaseTag ?? `v${normalizeReleaseVersion(session.targetVersion)}`,
    releaseUrl: session.releaseUrl,
    releaseNotes: session.releaseNotes,
    assetName: session.assetName,
    assetSize: session.assetSize,
    downloadedBytes: session.assetSize ?? 0,
    totalBytes: session.assetSize,
    downloadedPath: session.downloadedPath,
    readyToInstall: true,
    restartRequired: false,
    error: null,
  };
}

export function createPersistedAppUpdateSession(input: {
  phase: AppUpdateSessionPhase;
  platform: NodeJS.Platform;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string | null;
  releaseNotes: string | null;
  assetName: string;
  assetSize: number | null;
  downloadedPath: string;
  createdAt?: string;
  requestedAt?: string | null;
}): PersistedAppUpdateSession {
  return {
    phase: input.phase,
    platform: input.platform,
    targetVersion: normalizeReleaseVersion(input.latestVersion),
    releaseTag: input.latestVersion.startsWith('v')
      ? input.latestVersion
      : `v${normalizeReleaseVersion(input.latestVersion)}`,
    releaseUrl: input.releaseUrl,
    releaseNotes: input.releaseNotes,
    assetName: input.assetName,
    assetSize: input.assetSize,
    downloadedPath: input.downloadedPath,
    currentVersionAtDownload: normalizeReleaseVersion(input.currentVersion),
    createdAt: input.createdAt ?? new Date().toISOString(),
    requestedAt: input.requestedAt ?? null,
  };
}

export function reconcilePersistedAppUpdateState(
  input: ReconcilePersistedAppUpdateStateInput,
): ReconcilePersistedAppUpdateStateResult {
  const baseState = createBaseAppUpdateState(input.currentVersion, input.supported);
  let clearSession = false;
  let clearResultMarker = false;
  let session = input.session;

  if (session) {
    const sessionTargetVersion = normalizeReleaseVersion(session.targetVersion);
    if (!input.downloadedFileExists || compareReleaseVersions(input.currentVersion, sessionTargetVersion) >= 0) {
      session = null;
      clearSession = true;
    }
  }

  if (input.resultMarker) {
    clearResultMarker = true;
    const markerVersion = normalizeReleaseVersion(input.resultMarker.version);
    if (input.resultMarker.status === 'success' && compareReleaseVersions(input.currentVersion, markerVersion) >= 0) {
      return {
        state: {
          ...baseState,
          latestVersion: `v${normalizeReleaseVersion(input.currentVersion)}`,
        },
        clearSession: clearSession || !!input.session,
        clearResultMarker,
      };
    }

    if (session) {
      const resumedState = buildStateFromPersistedSession(baseState, session);
      return {
        state: {
          ...resumedState,
          error: input.resultMarker.message
            ?? (input.resultMarker.status === 'failed'
              ? 'The last update attempt did not finish successfully.'
              : 'The update did not finish applying. Install again to retry.'),
        },
        clearSession,
        clearResultMarker,
      };
    }

    return {
      state: {
        ...baseState,
        error: input.resultMarker.message
          ?? (input.resultMarker.status === 'failed'
            ? 'The last in-app update did not finish successfully.'
            : 'The updater reported success, but the installed version did not change.'),
      },
      clearSession,
      clearResultMarker,
    };
  }

  if (session) {
    const resumedState = buildStateFromPersistedSession(baseState, session);
    return {
      state: {
        ...resumedState,
        error: session.phase === 'install-requested'
          ? 'The previous update install did not complete. Install again to retry.'
          : null,
      },
      clearSession,
      clearResultMarker,
    };
  }

  return {
    state: baseState,
    clearSession,
    clearResultMarker,
  };
}
