import { checkCompatibility } from '../../electron/compatibility.js';
import type { HardwareProfile } from '../../electron/configGenerator.js';
import {
  isFlashPrepareBiosBlockedMessage,
  isFlashPrepareCompatibilityBlockedMessage,
  isFlashPrepareDiskIdentityBlockedMessage,
  isFlashPrepareEfiValidationBlockedMessage,
  isFlashPrepareSelectedDiskMissingMessage,
  normalizeErrorMessage,
} from './errorMessage.js';
import { isCompatibilityBlocked } from './releaseFlow.js';
import type { StepId } from './installStepGuards.js';

export function getFlashFailureTargetStep(
  errorMessage: string,
  profile: HardwareProfile | null | undefined,
): StepId {
  const normalized = normalizeErrorMessage(errorMessage).toLowerCase();
  const activeCompat = profile ? checkCompatibility(profile) : null;

  if (
    isFlashPrepareCompatibilityBlockedMessage(normalized)
    || (profile ? isCompatibilityBlocked(activeCompat) : false)
  ) {
    return 'report';
  }

  if (
    isFlashPrepareBiosBlockedMessage(normalized)
    || normalized.includes('bios step incomplete')
    || normalized.includes('required bios setting')
    || normalized.includes('firmware settings before flashing')
  ) {
    return 'bios';
  }

  if (
    isFlashPrepareEfiValidationBlockedMessage(normalized)
  ) {
    return 'report';
  }

  if (
    isFlashPrepareSelectedDiskMissingMessage(normalized)
    || isFlashPrepareDiskIdentityBlockedMessage(normalized)
    || normalized.includes('re-select the drive')
    || normalized.includes('confirmation token')
    || normalized.includes('flash confirmation is stale or missing')
  ) {
    return 'usb-select';
  }

  return 'usb-select';
}
