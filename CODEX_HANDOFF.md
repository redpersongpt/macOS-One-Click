# Codex Handoff

## Current State

- Version in tree: `2.3.3`
- Latest verified local checks:
  - `npm run lint`
  - `npx tsc -p electron/tsconfig.json --noEmit`
  - `npm test`
  - `npm run build`
- All four pass on the current tree.

## Latest Fixes

### BIOS-step recovery split
- The BIOS step no longer uses one combined `Recheck BIOS and Continue` action.
- It now has two distinct paths:
  - `Recheck BIOS`: reruns live firmware inspection, updates the checklist, stays on the BIOS step.
  - `Continue`: uses the current known BIOS checklist state without rerunning the probe, then attempts the guarded transition to the EFI build step.
- BIOS-specific failures now surface as BIOS-specific recovery payloads instead of collapsing into `unknown_error`.

### BIOS session persistence without probe
- Added `electron/bios/statePersistence.ts`.
- Main process now supports continuing from the current known BIOS state without forcing a fresh firmware readback.
- This preserves BIOS-step UX while keeping later build/deploy revalidation intact.

## Files Changed In This Pass

- `electron/bios/statePersistence.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/electron.d.ts`
- `src/App.tsx`
- `src/components/steps/BiosStep.tsx`
- `src/lib/biosStepFlow.ts`
- `src/lib/structuredErrors.ts`
- `test/biosStepFlow.test.ts`
- `test/biosStatePersistence.test.ts`
- `test/biosStep.test.tsx`
- `test/errorRecovery.test.ts`

## Safety Invariants Still Intact

- Flash token safety unchanged.
- Live disk identity checks unchanged.
- Backup policy unchanged.
- BIOS readiness before write unchanged.
- EFI validation before write unchanged.
- Destructive confirmation flow unchanged.

## Release Notes For This Fix

- BIOS step no longer drops normal blocked states into a vague unknown error.
- Recheck BIOS and Continue are now separate, explicit actions.
- Continue no longer silently reruns the BIOS probe.

## Remaining Notes

- Release workflow still emits the existing GitHub marketplace Node deprecation warnings.
- That warning is non-blocking and unrelated to the BIOS-step fix.
