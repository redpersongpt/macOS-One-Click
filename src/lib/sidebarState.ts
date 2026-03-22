import type { StepId } from './installStepGuards.js';

export type SidebarStatus = 'active' | 'complete' | 'pending';

export function getSidebarStatus(
  currentStep: StepId,
  itemId: string,
  stepOrder: StepId[],
): SidebarStatus {
  if (itemId === currentStep) return 'active';

  const currentIndex = stepOrder.indexOf(currentStep);
  const itemIndex = stepOrder.indexOf(itemId as StepId);

  if (currentIndex === -1 || itemIndex === -1) return 'pending';
  return itemIndex < currentIndex ? 'complete' : 'pending';
}
