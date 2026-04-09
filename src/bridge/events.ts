import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TaskUpdate } from './types';

/**
 * Subscribe to backend events.
 * Returns an unlisten function to clean up the subscription.
 */
export function onTaskUpdate(callback: (update: TaskUpdate) => void): Promise<UnlistenFn> {
  return listen<TaskUpdate>('task:update', (event) => {
    callback(event.payload);
  });
}

export function onFlashMilestone(callback: (milestone: { phase: string; detail: string }) => void): Promise<UnlistenFn> {
  return listen('flash:milestone', (event) => {
    callback(event.payload as { phase: string; detail: string });
  });
}

export function onRecoveryProgress(callback: (progress: { percent: number; status: string }) => void): Promise<UnlistenFn> {
  return listen('recovery:progress', (event) => {
    callback(event.payload as { percent: number; status: string });
  });
}
