export interface BuildEntryUiState {
  progress: number;
  statusText: string;
}

export function createBuildEntryUiState(): BuildEntryUiState {
  return {
    progress: 0,
    statusText: 'Preparing EFI build…',
  };
}

export function canStartBuildRun(input: {
  hasProfile: boolean;
  isDeploying: boolean;
  startRequested: boolean;
}): boolean {
  return input.hasProfile && !input.isDeploying && !input.startRequested;
}

export function taskBelongsToRun(
  task: { startedAt: number } | null | undefined,
  runStartedAt: number | null | undefined,
): boolean {
  if (!task || runStartedAt == null) return false;
  return task.startedAt >= runStartedAt;
}
