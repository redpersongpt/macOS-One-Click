import { describe, expect, it } from 'vitest';
import { getFlashFailureTargetStep } from '../src/lib/flashErrorRouting.js';

describe('getFlashFailureTargetStep — original flash safety messages', () => {
  it('routes BIOS readiness blockers back to bios', () => {
    expect(getFlashFailureTargetStep(
      "Error invoking remote method 'flash:prepare-confirmation': Error: SAFETY BLOCK: BIOS readiness is no longer satisfied. Re-verify firmware settings before flashing.",
      null,
    )).toBe('bios');
  });

  it('routes compatibility blockers back to report', () => {
    expect(getFlashFailureTargetStep(
      "Error invoking remote method 'flash:prepare-confirmation': Error: Compatibility is blocked. Fix the compatibility report before deployment.",
      null,
    )).toBe('report');
  });

  it('routes missing disk identity back to usb-select', () => {
    expect(getFlashFailureTargetStep(
      "Error invoking remote method 'flash:prepare-confirmation': Error: SAFETY BLOCK: No disk identity fingerprint was captured for this selection. Re-select the drive before flashing.",
      null,
    )).toBe('usb-select');
  });

  it('routes stalled flash tasks back to usb-select', () => {
    expect(getFlashFailureTargetStep(
      "Error invoking remote method 'flash-usb': Error: Operation stalled: no progress received for 900 seconds. Please check the current step and try again.",
      null,
    )).toBe('usb-select');
  });
});

// classifyError() in main.ts transforms flash preparation errors before they
// reach the renderer. These tests cover the classified-message forms that the
// renderer actually receives, which differ from the original flashSafety.ts
// strings. The committed routing code missed these; the predicate functions
// added by the local error-file changes cover both forms.
describe('getFlashFailureTargetStep — classified flash preparation messages', () => {
  it('routes classified BIOS-blocked message back to bios', () => {
    // classifyError maps 'SAFETY BLOCK: BIOS readiness is no longer satisfied...'
    // to 'Flash preparation is blocked by BIOS readiness: The firmware checklist...'
    expect(getFlashFailureTargetStep(
      'Flash preparation is blocked by BIOS readiness: The firmware checklist no longer passes at the destructive flash boundary, so the USB write step was stopped before it started.',
      null,
    )).toBe('bios');
  });

  it('routes classified compatibility-blocked message back to report', () => {
    // classifyError maps 'Compatibility is blocked...' to
    // 'Flash preparation is blocked by compatibility: The selected macOS target...'
    expect(getFlashFailureTargetStep(
      'Flash preparation is blocked by compatibility: The selected macOS target is no longer deployable for the current hardware path, so retrying the USB write step will not fix it.',
      null,
    )).toBe('report');
  });

  it('routes classified disk-identity-missing message back to usb-select', () => {
    // classifyError maps 'Disk identity could not be confirmed...' to
    // 'Flash preparation is blocked by missing disk identity: The app could not confirm...'
    expect(getFlashFailureTargetStep(
      'Flash preparation is blocked by missing disk identity: The app could not confirm the physical identity of the target drive immediately before the destructive write step.',
      null,
    )).toBe('usb-select');
  });

  it('routes EFI validation blocked message back to report', () => {
    // EFI validation falls through classifyError to generic; the original
    // 'efi validation is no longer clean' string is preserved in the explanation.
    expect(getFlashFailureTargetStep(
      'SAFETY BLOCK: EFI validation is no longer clean. Rebuild or revalidate the EFI before flashing.',
      null,
    )).toBe('report');
  });
});
