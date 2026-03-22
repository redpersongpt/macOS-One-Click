import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { getSidebarStatus } from '../src/lib/sidebarState.js';
import type { StepId } from '../src/lib/installStepGuards.js';

const STEP_ORDER: StepId[] = ['welcome','prereq','precheck','scanning','version-select','report','method-select','bios','building','kext-fetch','recovery-download','usb-select','part-prep','flashing','complete'];

describe('sidebarState', () => {
  test('version-select is active without leaving scanning active', () => {
    assert.equal(getSidebarStatus('version-select', 'version-select', STEP_ORDER), 'active');
    assert.equal(getSidebarStatus('version-select', 'scanning', STEP_ORDER), 'complete');
  });

  test('only one sidebar step is active for a given current step', () => {
    const activeSteps = STEP_ORDER.filter((step) => getSidebarStatus('report', step, STEP_ORDER) === 'active');
    assert.deepEqual(activeSteps, ['report']);
  });
});
