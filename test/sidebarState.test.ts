import { describe, it, expect } from 'vitest';
import { getSidebarStatus } from '../src/lib/sidebarState.js';
import type { StepId } from '../src/lib/installStepGuards.js';

const STEP_ORDER: StepId[] = [
  'welcome', 'prereq', 'precheck', 'scanning', 'version-select',
  'report', 'method-select', 'bios', 'building', 'kext-fetch',
  'recovery-download', 'usb-select', 'part-prep', 'flashing', 'complete',
];

describe('getSidebarStatus – single-active invariant', () => {
  const allSteps = STEP_ORDER;

  for (const currentStep of allSteps) {
    it(`exactly one item is active when currentStep is "${currentStep}"`, () => {
      const statuses = allSteps.map((id) => getSidebarStatus(currentStep, id, STEP_ORDER));
      const activeCount = statuses.filter((s) => s === 'active').length;
      expect(activeCount).toBe(1);
    });

    it(`active item matches currentStep "${currentStep}"`, () => {
      const activeItems = allSteps.filter(
        (id) => getSidebarStatus(currentStep, id, STEP_ORDER) === 'active',
      );
      expect(activeItems).toEqual([currentStep]);
    });

    it(`items before "${currentStep}" are complete, items after are pending`, () => {
      const currentIndex = STEP_ORDER.indexOf(currentStep);
      for (let i = 0; i < allSteps.length; i++) {
        const status = getSidebarStatus(currentStep, allSteps[i], STEP_ORDER);
        if (i < currentIndex) expect(status).toBe('complete');
        else if (i === currentIndex) expect(status).toBe('active');
        else expect(status).toBe('pending');
      }
    });
  }

  it('unknown itemId returns pending', () => {
    expect(getSidebarStatus('building', 'nonexistent', STEP_ORDER)).toBe('pending');
  });
});
