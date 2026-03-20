import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  canStartBuildRun,
  createBuildEntryUiState,
  taskBelongsToRun,
} from '../src/lib/buildRuntime.js';

describe('buildRuntime', () => {
  test('initializes a fresh build screen at zero progress', () => {
    const state = createBuildEntryUiState();
    assert.equal(state.progress, 0);
    assert.match(state.statusText, /preparing efi build/i);
  });

  test('does not allow a second build start while one is already requested', () => {
    assert.equal(canStartBuildRun({
      hasProfile: true,
      isDeploying: false,
      startRequested: false,
    }), true);

    assert.equal(canStartBuildRun({
      hasProfile: true,
      isDeploying: false,
      startRequested: true,
    }), false);
  });

  test('rejects stale task updates from an older run', () => {
    assert.equal(taskBelongsToRun({ startedAt: 900 }, 1_000), false);
    assert.equal(taskBelongsToRun({ startedAt: 1_000 }, 1_000), true);
    assert.equal(taskBelongsToRun({ startedAt: 1_100 }, 1_000), true);
  });
});
