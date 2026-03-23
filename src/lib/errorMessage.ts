export function normalizeErrorMessage(input: string | Error | null | undefined): string {
  let normalized = input instanceof Error ? input.message : String(input ?? '');
  let previous = '';

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim();
  }

  return normalized;
}

export function normalizeErrorMessageLower(input: string | Error | null | undefined): string {
  return normalizeErrorMessage(input).toLowerCase();
}

export function isFlashPrepareBiosBlockedMessage(input: string | Error | null | undefined): boolean {
  const message = normalizeErrorMessageLower(input);
  return message.includes('bios readiness is no longer satisfied')
    || message.includes('flash preparation is blocked by bios readiness')
    || message.includes('firmware checklist no longer passes at the destructive flash boundary')
    || message.includes('bios preparation must be complete before deployment');
}

export function isFlashPrepareCompatibilityBlockedMessage(input: string | Error | null | undefined): boolean {
  const message = normalizeErrorMessageLower(input);
  return message.includes('compatibility is blocked')
    || message.includes('no supported display path')
    || message.includes('flash preparation is blocked by compatibility')
    || message.includes('selected macos target is no longer deployable')
    || message.includes('current machine no longer has a supported deployment path');
}

export function isFlashPrepareSelectedDiskMissingMessage(input: string | Error | null | undefined): boolean {
  const message = normalizeErrorMessageLower(input);
  return message.includes('no target disk is selected for flashing')
    || message.includes('flash preparation is blocked by a missing selected drive')
    || message.includes('without a live selected target disk')
    || (message.includes('target disk') && message.includes('no longer available'));
}

export function isFlashPrepareDiskIdentityBlockedMessage(input: string | Error | null | undefined): boolean {
  const message = normalizeErrorMessageLower(input);
  return message.includes('disk identity could not be confirmed')
    || message.includes('no disk identity fingerprint was captured')
    || message.includes('flash preparation is blocked by missing disk identity')
    || message.includes('could not confirm the physical identity of the target drive');
}

export function isFlashPrepareEfiValidationBlockedMessage(input: string | Error | null | undefined): boolean {
  const message = normalizeErrorMessageLower(input);
  return message.includes('efi validation is no longer clean')
    || message.includes('flash preparation is blocked by efi validation')
    || message.includes('a validated efi is required before deployment')
    || message.includes('efi validation is blocked');
}

export function isGenericFlashPrepareBlockedMessage(input: string | Error | null | undefined): boolean {
  const message = normalizeErrorMessageLower(input);
  return message.includes('flash preparation is blocked')
    || message.includes('usb write step was stopped before it started')
    || (message.includes('prepare-confirmation') && message.includes('safety block'));
}
