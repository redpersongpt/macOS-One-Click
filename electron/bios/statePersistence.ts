import type { BIOSConfig, HardwareProfile } from '../configGenerator.js';
import type { FirmwareInfo } from '../firmwarePreflight.js';
import { buildBiosOrchestratorState } from './orchestrator.js';
import { buildHardwareFingerprint, createBiosSession, loadBiosSession, saveBiosSession } from './sessionState.js';
import { verifyBiosSelections } from './verification.js';
import type {
  BiosOrchestratorState,
  BiosSessionStage,
  BiosSettingSelection,
} from './types.js';

const REBOOT_STAGES = new Set<BiosSessionStage>([
  'ready_for_reboot',
  'rebooting_to_firmware',
  'awaiting_return',
]);

function buildFallbackSelections(state: BiosOrchestratorState): Record<string, BiosSettingSelection> {
  return Object.fromEntries(
    state.settings.map((setting) => [
      setting.id,
      {
        approved: false,
        applyMode: setting.applyMode,
      },
    ]),
  );
}

export function persistBiosOrchestratorState(input: {
  userDataPath: string;
  profile: HardwareProfile;
  biosConfig: BIOSConfig;
  firmwareInfo: FirmwareInfo | null;
  platform: NodeJS.Platform;
  safeMode?: boolean;
  selectedChanges?: Record<string, BiosSettingSelection>;
  stageWhenBlocked?: BiosSessionStage;
}): BiosOrchestratorState {
  const safeMode = input.safeMode ?? true;
  const existing = loadBiosSession(input.userDataPath);
  const hardwareFingerprint = buildHardwareFingerprint(input.profile);
  const activeSession = existing?.hardwareFingerprint === hardwareFingerprint ? existing : null;

  const baseState = buildBiosOrchestratorState({
    profile: input.profile,
    biosConfig: input.biosConfig,
    firmwareInfo: input.firmwareInfo,
    platform: input.platform,
    safeMode,
    session: activeSession,
  });

  const finalSelections = input.selectedChanges
    ?? (activeSession?.selectedChanges as Record<string, BiosSettingSelection> | undefined)
    ?? buildFallbackSelections(baseState);

  const verification = verifyBiosSelections({
    settings: baseState.settings,
    firmwareInfo: input.firmwareInfo,
    selectedChanges: finalSelections,
  });

  const nextStage = verification.readyToBuild
    ? 'complete'
    : (input.stageWhenBlocked ?? activeSession?.stage ?? 'planned');

  const session = createBiosSession({
    userDataPath: input.userDataPath,
    profile: input.profile,
    vendor: baseState.vendor,
    stage: nextStage,
    rebootRequested: REBOOT_STAGES.has(nextStage),
    selectedChanges: finalSelections,
    previousSessionId: activeSession?.sessionId ?? null,
  });

  const finalState = buildBiosOrchestratorState({
    profile: input.profile,
    biosConfig: input.biosConfig,
    firmwareInfo: input.firmwareInfo,
    platform: input.platform,
    safeMode,
    session,
  });

  if (finalState.readyToBuild && finalState.session && finalState.session.stage !== 'complete') {
    saveBiosSession(input.userDataPath, {
      ...finalState.session,
      stage: 'complete',
      rebootRequested: false,
      timestamp: Date.now(),
    });
    return buildBiosOrchestratorState({
      profile: input.profile,
      biosConfig: input.biosConfig,
      firmwareInfo: input.firmwareInfo,
      platform: input.platform,
      safeMode,
      session: loadBiosSession(input.userDataPath),
    });
  }

  return finalState;
}
