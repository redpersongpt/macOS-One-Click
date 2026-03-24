/**
 * Runtime Determinism Tests — OpCore-OneClick
 *
 * Tests the core runtime invariants that prevent the app from feeling janky:
 * - Stale task rejection via taskBelongsToRun
 * - Build start gate via canStartBuildRun
 * - Build flow stall detection via evaluateBuildFlowStall
 */

import { describe, it, expect } from 'vitest';
import { canStartBuildRun, taskBelongsToRun } from '../src/lib/buildRuntime.js';
import {
  evaluateBuildFlowStall,
  DEFAULT_BUILD_FLOW_THRESHOLDS,
  type BuildFlowSnapshot,
} from '../src/lib/buildFlowMonitor.js';

function makeSnapshot(overrides: Partial<BuildFlowSnapshot> = {}): BuildFlowSnapshot {
  return {
    active: true,
    runId: 1,
    phase: 'efi-build',
    uiStep: 'building',
    startedAt: Date.now(),
    lastProgressAt: Date.now(),
    activeTaskKind: 'efi-build',
    activeTaskStatus: 'running',
    lastTaskPhase: null,
    taskCompleteEventFired: false,
    validationStarted: false,
    validationFinished: false,
    pendingRendererExpectation: null,
    transitionGuardBlocked: null,
    stalledReason: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STALE TASK REJECTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Runtime: stale task rejection', () => {
  it('task started before run is rejected', () => {
    expect(taskBelongsToRun({ startedAt: 1000 }, 2000)).toBe(false);
  });

  it('task started at run start is accepted', () => {
    expect(taskBelongsToRun({ startedAt: 2000 }, 2000)).toBe(true);
  });

  it('task started after run start is accepted', () => {
    expect(taskBelongsToRun({ startedAt: 3000 }, 2000)).toBe(true);
  });

  it('null task is rejected', () => {
    expect(taskBelongsToRun(null, 2000)).toBe(false);
  });

  it('undefined runStartedAt rejects all tasks', () => {
    expect(taskBelongsToRun({ startedAt: 1000 }, undefined)).toBe(false);
    expect(taskBelongsToRun({ startedAt: 1000 }, null)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BUILD START GATE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Runtime: build start gate', () => {
  it('allows start when profile present and not deploying', () => {
    expect(canStartBuildRun({
      hasProfile: true,
      isDeploying: false,
      startRequested: false,
    })).toBe(true);
  });

  it('blocks start when already deploying', () => {
    expect(canStartBuildRun({
      hasProfile: true,
      isDeploying: true,
      startRequested: false,
    })).toBe(false);
  });

  it('blocks start when already requested', () => {
    expect(canStartBuildRun({
      hasProfile: true,
      isDeploying: false,
      startRequested: true,
    })).toBe(false);
  });

  it('blocks start when no profile', () => {
    expect(canStartBuildRun({
      hasProfile: false,
      isDeploying: false,
      startRequested: false,
    })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. BUILD FLOW STALL DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Runtime: build flow stall detection', () => {
  it('fresh active snapshot is healthy', () => {
    const now = Date.now();
    const snapshot = makeSnapshot({ startedAt: now, lastProgressAt: now });
    expect(evaluateBuildFlowStall(snapshot, now).level).toBe('healthy');
  });

  it('inactive snapshot is always healthy', () => {
    const now = Date.now();
    const snapshot = makeSnapshot({
      active: false,
      lastProgressAt: now - 300_000,
    });
    expect(evaluateBuildFlowStall(snapshot, now).level).toBe('healthy');
  });

  it('null snapshot is healthy', () => {
    expect(evaluateBuildFlowStall(null, Date.now()).level).toBe('healthy');
  });

  it('active snapshot idle beyond hard threshold is stalled', () => {
    const now = Date.now();
    const snapshot = makeSnapshot({
      active: true,
      lastProgressAt: now - DEFAULT_BUILD_FLOW_THRESHOLDS.hardMs - 1000,
      activeTaskStatus: 'running',
    });
    expect(evaluateBuildFlowStall(snapshot, now).level).toBe('stalled');
  });

  it('active snapshot idle beyond soft threshold is taking_longer', () => {
    const now = Date.now();
    const snapshot = makeSnapshot({
      active: true,
      lastProgressAt: now - DEFAULT_BUILD_FLOW_THRESHOLDS.softMs - 1000,
      activeTaskStatus: 'running',
    });
    const result = evaluateBuildFlowStall(snapshot, now);
    expect(result.level).toBe('taking_longer');
  });

  it('failed task status is always stalled', () => {
    const now = Date.now();
    const snapshot = makeSnapshot({
      active: true,
      activeTaskStatus: 'failed',
      lastProgressAt: now,
    });
    expect(evaluateBuildFlowStall(snapshot, now).level).toBe('stalled');
  });

  it('cancelled task status is always stalled', () => {
    const now = Date.now();
    const snapshot = makeSnapshot({
      active: true,
      activeTaskStatus: 'cancelled',
      lastProgressAt: now,
    });
    expect(evaluateBuildFlowStall(snapshot, now).level).toBe('stalled');
  });

  it('transition guard blocked is stalled', () => {
    const now = Date.now();
    const snapshot = makeSnapshot({
      active: true,
      transitionGuardBlocked: 'missing compatibility report',
      lastProgressAt: now,
    });
    expect(evaluateBuildFlowStall(snapshot, now).level).toBe('stalled');
    expect(evaluateBuildFlowStall(snapshot, now).reason).toContain('missing compatibility report');
  });
});
