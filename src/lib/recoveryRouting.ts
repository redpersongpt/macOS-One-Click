import type { StepId } from './installStepGuards.js';

export type RecoveryRetryAction =
  | { kind: 'scan' }
  | { kind: 'refresh_bios' }
  | { kind: 'restart_build' }
  | { kind: 'refresh_usb' }
  | { kind: 'refresh_partition' }
  | { kind: 'reselect_method' }
  | { kind: 'noop' };

export interface RecoveryRetryContext {
  targetStep: string | null | undefined;
  hasProfile: boolean;
  hasMethod: boolean;
  buildReady: boolean;
}

export interface RecoveryBackToSafetyContext {
  hasProfile: boolean;
}

export function resolveRecoveryRetryAction(context: RecoveryRetryContext): RecoveryRetryAction {
  switch (context.targetStep) {
    case 'scanning':
      return { kind: 'scan' };
    case 'bios':
      return context.hasProfile ? { kind: 'refresh_bios' } : { kind: 'noop' };
    case 'building':
    case 'kext-fetch':
    case 'recovery-download':
      return context.hasProfile ? { kind: 'restart_build' } : { kind: 'noop' };
    case 'usb-select':
      return { kind: 'refresh_usb' };
    case 'part-prep':
      return { kind: 'refresh_partition' };
    case 'method-select':
      return context.hasMethod ? { kind: 'reselect_method' } : { kind: 'noop' };
    default:
      return context.hasProfile && !context.buildReady ? { kind: 'restart_build' } : { kind: 'noop' };
  }
}

export function resolveBackToSafetyStep(context: RecoveryBackToSafetyContext): StepId {
  return context.hasProfile ? 'report' : 'landing';
}
