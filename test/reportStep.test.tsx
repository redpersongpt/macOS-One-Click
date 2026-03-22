import React from 'react';
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HardwareProfile } from '../electron/configGenerator.js';
import type { CompatibilityReport } from '../electron/compatibility.js';
import type { CompatibilityMatrix } from '../electron/compatibilityMatrix.js';
import type { ResourcePlan } from '../electron/resourcePlanner.js';
import ReportStep from '../src/components/steps/ReportStep.js';

function makeProfile(): HardwareProfile {
  return {
    cpu: 'AMD Ryzen 7 7700X',
    architecture: 'AMD',
    generation: 'Ryzen',
    coreCount: 8,
    gpu: 'AMD Radeon RX 6800',
    gpuDevices: [{ name: 'AMD Radeon RX 6800', vendorName: 'AMD' }],
    ram: '32 GB',
    motherboard: 'ASUS Prime X670-P',
    targetOS: 'macOS Tahoe 26',
    smbios: 'iMacPro1,1',
    kexts: ['Lilu.kext'],
    ssdts: ['SSDT-EC-USBX.aml'],
    bootArgs: '',
    isLaptop: false,
    isVM: false,
    strategy: 'canonical',
    scanConfidence: 'high',
  };
}

function makeReport(): CompatibilityReport {
  return {
    level: 'supported',
    strategy: 'canonical',
    confidence: 'high',
    explanation: 'AMD desktop with a supported display path. This is a solid OpenCore starting point.',
    manualVerificationRequired: false,
    isCompatible: true,
    maxOSVersion: 'macOS Tahoe 26',
    eligibleVersions: [{ id: '26', name: 'macOS Tahoe 26', icon: 'tahoe' }],
    recommendedVersion: 'macOS Tahoe 26',
    warnings: [],
    errors: [],
    minReqMet: true,
    communityEvidence: null,
    nextActions: [],
    advisoryConfidence: {
      score: 88,
      label: 'High confidence',
      explanation: 'High confidence.',
    },
    mostLikelyFailurePoints: [],
  };
}

function makeMatrix(): CompatibilityMatrix {
  return {
    recommendedVersion: 'macOS Tahoe 26',
    rows: [{
      versionId: '26',
      versionName: 'macOS Tahoe 26',
      icon: 'tahoe',
      numeric: 26,
      status: 'supported',
      reason: 'Best supported target.',
      recommended: true,
      reportLevel: 'supported',
    }],
  };
}

function makePlan(): ResourcePlan {
  return {
    resources: [{
      name: 'Lilu.kext',
      kind: 'kext',
      source: 'https://github.com/acidanthera/Lilu/releases/latest',
      expectedIdentityOrVersion: 'acidanthera/Lilu (RELEASE)',
      validationOutcome: 'verified',
      sourceClass: 'downloaded',
    }],
  };
}

describe('ReportStep', () => {
  test('uses the responsive wide layout without the old nested scroll region', () => {
    const html = renderToStaticMarkup(
      <ReportStep
        profile={makeProfile()}
        report={makeReport()}
        matrix={makeMatrix()}
        interpretation={null}
        profileArtifact={null}
        resourcePlan={makePlan()}
        planningOnly={true}
        planningProfileContext="saved_artifact"
        simulationResult={null}
        simulationRunning={false}
        onSaveProfile={() => {}}
        onExportProfile={() => {}}
        onImportProfile={() => {}}
        onRunSimulation={() => {}}
        onRunLiveScan={() => {}}
        onContinue={() => {}}
      />,
    );

    assert.match(html, /xl:grid-cols-\[minmax\(0,1\.3fr\)_minmax\(360px,0\.9fr\)\]/);
    assert.match(html, /flex flex-wrap items-center gap-2 xl:justify-end/);
    assert.match(html, /Imported and restored profiles are for planning only\. Run a live scan before BIOS, build, or flash\./);
    assert.doesNotMatch(html, /overflow-y-auto custom-scrollbar space-y-5 pr-1/);
  });
});
