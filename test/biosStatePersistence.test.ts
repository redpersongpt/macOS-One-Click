import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBIOSSettings, type HardwareProfile } from '../electron/configGenerator.js';
import { persistBiosOrchestratorState } from '../electron/bios/statePersistence.js';
import { loadBiosSession } from '../electron/bios/sessionState.js';

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

function makeTempUserDataPath(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bios-state-persist-'));
}

describe('bios state persistence', () => {
  test('current-state continue can complete BIOS readiness without rerunning firmware detection', () => {
    const profile = makeProfile();
    const userDataPath = makeTempUserDataPath();

    try {
      const biosConfig = getBIOSSettings(profile);
      const initial = persistBiosOrchestratorState({
        userDataPath,
        profile,
        biosConfig,
        firmwareInfo: null,
        platform: 'win32',
        safeMode: true,
        stageWhenBlocked: 'partially_verified',
      });

      const selectedChanges = Object.fromEntries(
        initial.settings.map((setting) => [
          setting.id,
          {
            approved: setting.required,
            applyMode: 'manual' as const,
          },
        ]),
      ) as Record<string, { approved: boolean; applyMode: 'manual' }>;

      const completed = persistBiosOrchestratorState({
        userDataPath,
        profile,
        biosConfig,
        firmwareInfo: null,
        platform: 'win32',
        safeMode: true,
        selectedChanges,
        stageWhenBlocked: 'partially_verified',
      });

      assert.equal(completed.readyToBuild, true);
      assert.equal(completed.stage, 'complete');
      const session = loadBiosSession(userDataPath);
      assert.equal(session?.stage, 'complete');
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  test('current-state continue stays partially verified when required settings are still missing', () => {
    const profile = makeProfile();
    const userDataPath = makeTempUserDataPath();

    try {
      const biosConfig = getBIOSSettings(profile);
      const initial = persistBiosOrchestratorState({
        userDataPath,
        profile,
        biosConfig,
        firmwareInfo: null,
        platform: 'win32',
        safeMode: true,
        stageWhenBlocked: 'partially_verified',
      });

      const selectedChanges = Object.fromEntries(
        initial.settings.map((setting, index) => [
          setting.id,
          {
            approved: setting.required && index === 0,
            applyMode: 'manual' as const,
          },
        ]),
      ) as Record<string, { approved: boolean; applyMode: 'manual' }>;

      const incomplete = persistBiosOrchestratorState({
        userDataPath,
        profile,
        biosConfig,
        firmwareInfo: null,
        platform: 'win32',
        safeMode: true,
        selectedChanges,
        stageWhenBlocked: 'partially_verified',
      });

      assert.equal(incomplete.readyToBuild, false);
      assert.equal(incomplete.stage, 'partially_verified');
      assert.ok(incomplete.blockingIssues.length > 0);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });
});
