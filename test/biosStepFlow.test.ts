import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import type { BiosOrchestratorState, BiosSettingSelection } from '../electron/bios/types.js';
import type { HardwareProfile } from '../electron/configGenerator.js';
import { buildFailureRecoveryViewModel } from '../src/lib/failureRecovery.js';
import {
  buildBiosRecoveryPayload,
  performBiosContinue,
  performBiosRecheck,
  summarizeBiosBlockingIssues,
} from '../src/lib/biosStepFlow.js';

function makeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpu: 'Intel Core i5-8250U',
    architecture: 'Intel',
    generation: 'Kaby Lake',
    coreCount: 4,
    gpu: 'Intel UHD Graphics 620',
    gpuDevices: [{ name: 'Intel UHD Graphics 620', vendorName: 'Intel' }],
    ram: '16 GB',
    motherboard: 'Lenovo 20L5',
    targetOS: 'macOS Ventura 13',
    smbios: 'MacBookPro14,1',
    kexts: [],
    ssdts: [],
    bootArgs: '-v',
    isLaptop: true,
    isVM: false,
    audioLayoutId: 3,
    strategy: 'canonical',
    scanConfidence: 'high',
    ...overrides,
  };
}

function makeState(overrides: Partial<BiosOrchestratorState> = {}): BiosOrchestratorState {
  return {
    vendor: 'Lenovo',
    backendId: 'lenovo',
    backendLabel: 'Lenovo BIOS helper',
    supportLevel: 'manual',
    safeMode: true,
    rebootSupported: true,
    stage: 'partially_verified',
    hardwareFingerprint: 'bios-flow-test',
    settings: [
      {
        id: 'secure-boot',
        name: 'Secure Boot',
        description: 'Disable Secure Boot',
        plainTitle: 'Secure Boot',
        currentStatus: 'Unknown',
        currentValue: null,
        recommendedValue: 'Disable',
        confidence: 'low',
        detectionMethod: 'Manual',
        riskLevel: 'low',
        supportLevel: 'manual',
        allowedApplyModes: ['manual', 'skipped'],
        applyMode: 'manual',
        verificationStatus: 'unknown',
        verificationDetail: 'Not yet verified.',
        required: true,
      },
      {
        id: 'uefi-mode',
        name: 'UEFI Boot Mode',
        description: 'Use UEFI boot mode',
        plainTitle: 'UEFI Boot Mode',
        currentStatus: 'Unknown',
        currentValue: null,
        recommendedValue: 'Enable',
        confidence: 'low',
        detectionMethod: 'Manual',
        riskLevel: 'low',
        supportLevel: 'manual',
        allowedApplyModes: ['manual', 'skipped'],
        applyMode: 'manual',
        verificationStatus: 'unknown',
        verificationDetail: 'Not yet verified.',
        required: true,
      },
    ],
    requiredCompletionCount: 2,
    completedRequiredCount: 0,
    readyToBuild: false,
    blockingIssues: ['Secure Boot is not verified', 'UEFI Boot Mode is not verified'],
    session: null,
    summary: 'Build remains blocked until required BIOS settings are verified.',
    ...overrides,
  };
}

function makeSelections(approved: boolean): Record<string, BiosSettingSelection> {
  return {
    'secure-boot': { approved, applyMode: 'manual' },
    'uefi-mode': { approved, applyMode: 'manual' },
  };
}

describe('bios step flow helpers', () => {
  test('recheck reruns firmware verification and stays on the BIOS step', async () => {
    let recheckCalls = 0;
    let continueCalls = 0;
    let advanceCalls = 0;
    let appliedState: BiosOrchestratorState | null = null;
    const readyState = makeState({
      stage: 'complete',
      readyToBuild: true,
      completedRequiredCount: 2,
      blockingIssues: [],
      settings: makeState().settings.map((setting) => ({
        ...setting,
        verificationStatus: 'verified',
      })),
    });

    const result = await performBiosRecheck({
      profile: makeProfile(),
      currentState: makeState(),
      applyVerifiedState: (state) => {
        appliedState = state;
      },
      recheckManualChanges: async () => {
        recheckCalls += 1;
        return readyState;
      },
      continueWithCurrentState: async () => {
        continueCalls += 1;
        return readyState;
      },
      advanceToBuildStep: () => {
        advanceCalls += 1;
        return true;
      },
      openRecoverySurface: () => {
        throw new Error('should not open recovery');
      },
    }, makeSelections(true));

    assert.equal(result.advanced, false);
    assert.match(result.message, /recheck complete/i);
    assert.equal(recheckCalls, 1);
    assert.equal(continueCalls, 0);
    assert.equal(advanceCalls, 0);
    assert.equal(appliedState, readyState);
  });

  test('continue uses current state and never reruns the BIOS probe', async () => {
    let recheckCalls = 0;
    let continueCalls = 0;
    let advanceCalls = 0;
    let appliedState: BiosOrchestratorState | null = null;
    const readyState = makeState({
      stage: 'complete',
      readyToBuild: true,
      completedRequiredCount: 2,
      blockingIssues: [],
      settings: makeState().settings.map((setting) => ({
        ...setting,
        verificationStatus: 'verified',
      })),
    });

    const result = await performBiosContinue({
      profile: makeProfile(),
      currentState: makeState(),
      applyVerifiedState: (state) => {
        appliedState = state;
      },
      recheckManualChanges: async () => {
        recheckCalls += 1;
        return readyState;
      },
      continueWithCurrentState: async () => {
        continueCalls += 1;
        return readyState;
      },
      advanceToBuildStep: () => {
        advanceCalls += 1;
        return true;
      },
      openRecoverySurface: () => {
        throw new Error('should not open recovery');
      },
    }, makeSelections(true));

    assert.equal(result.advanced, true);
    assert.match(result.message, /moving to the efi build step/i);
    assert.equal(recheckCalls, 0);
    assert.equal(continueCalls, 1);
    assert.equal(advanceCalls, 1);
    assert.equal(appliedState, readyState);
  });

  test('blocked continue uses BIOS-specific explanation instead of opening a generic error', async () => {
    let openedPayload = false;
    const blockedState = makeState();

    const result = await performBiosContinue({
      profile: makeProfile(),
      currentState: blockedState,
      applyVerifiedState: () => {},
      recheckManualChanges: async () => blockedState,
      continueWithCurrentState: async () => blockedState,
      advanceToBuildStep: () => true,
      openRecoverySurface: () => {
        openedPayload = true;
      },
    }, makeSelections(false));

    assert.equal(result.advanced, false);
    assert.match(result.message, /secure boot is not verified/i);
    assert.equal(openedPayload, false);
  });

  test('missing BIOS state is classified explicitly', async () => {
    let payloadCode: string | null = null;

    const result = await performBiosContinue({
      profile: makeProfile(),
      currentState: null,
      applyVerifiedState: () => {},
      recheckManualChanges: async () => makeState(),
      continueWithCurrentState: async () => makeState(),
      advanceToBuildStep: () => true,
      openRecoverySurface: (payload) => {
        payloadCode = payload.code ?? null;
      },
    }, makeSelections(true));

    assert.equal(result.advanced, false);
    assert.equal(payloadCode, 'bios_state_unavailable');
  });

  test('recheck failure is not rendered as unknown error', async () => {
    let payload = null as ReturnType<typeof buildBiosRecoveryPayload> | null;

    const result = await performBiosRecheck({
      profile: makeProfile(),
      currentState: makeState(),
      applyVerifiedState: () => {},
      recheckManualChanges: async () => {
        throw new Error('WMI BIOS probe timed out');
      },
      continueWithCurrentState: async () => makeState(),
      advanceToBuildStep: () => false,
      openRecoverySurface: (nextPayload) => {
        payload = nextPayload;
      },
    }, makeSelections(true));

    assert.equal(result.advanced, false);
    assert.equal(payload?.code, 'bios_recheck_failed');
    const recoveryView = buildFailureRecoveryViewModel(payload);
    assert.ok(recoveryView);
    assert.doesNotMatch(recoveryView!.title, /something went wrong/i);
  });

  test('blocking summary remains concise and BIOS-specific', () => {
    const summary = summarizeBiosBlockingIssues(makeState());
    assert.match(summary, /secure boot is not verified/i);
    assert.match(summary, /1 more bios setting/i);
  });
});
