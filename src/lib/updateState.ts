import type { AppUpdateState } from '../../electron/appUpdater.js';

export const APP_UPDATE_REFRESH_INTERVAL_MS = 1500;

export function shouldRefreshAppUpdateState(state: AppUpdateState | null | undefined): boolean {
  return Boolean(state?.checking || state?.downloading || state?.installing);
}
