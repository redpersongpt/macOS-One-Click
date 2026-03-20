import React from 'react';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HardwareProfile } from '../electron/configGenerator.js';
import { checkCompatibility } from '../electron/compatibility.js';
import type { ValidationResult } from '../electron/configValidator.js';
import { generateEfiReport } from '../src/lib/efiReport.js';
import EfiReportPanel from '../src/components/EfiReport.js';

function makeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpu: 'Intel Core i5-4300M',
    architecture: 'Intel',
    generation: 'Haswell',
    coreCount: 2,
    gpu: 'Intel HD Graphics 4600',
    gpuDevices: [{ name: 'Intel HD Graphics 4600', vendorName: 'Intel' }],
    ram: '8 GB',
    motherboard: 'ThinkPad T440p',
    targetOS: 'macOS Monterey 12',
    smbios: 'MacBookPro11,1',
    kexts: ['Lilu', 'VirtualSMC', 'WhateverGreen', 'AppleALC', 'VoodooPS2Controller'],
    ssdts: ['SSDT-EC-USBX'],
    bootArgs: '-v alcid=11',
    isLaptop: true,
    isVM: false,
    audioLayoutId: 11,
    strategy: 'conservative',
    scanConfidence: 'high',
    ...overrides,
  };
}

function makeValidationResult(overall: ValidationResult['overall']): ValidationResult {
  return {
    overall,
    checkedAt: new Date().toISOString(),
    issues: overall === 'warning'
      ? [{
          code: 'AUDIO_LAYOUT_WARNING',
          severity: 'warning',
          message: 'Audio layout still needs manual review.',
          detail: null,
          component: 'AppleALC',
          expectedPath: 'EFI/OC/Kexts/AppleALC.kext',
          actualCondition: 'Layout-id unverified',
        }]
      : [],
    firstFailureTrace: null,
  };
}

describe('efi report guidance', () => {
  test('adds next actions and decision provenance for experimental or risky paths', () => {
    const profile = makeProfile();
    const compat = checkCompatibility(profile);
    const report = generateEfiReport(profile, compat, [
      { name: 'Lilu', version: '1.6.8', source: 'github' },
      { name: 'VoodooPS2Controller', version: '2.3.6', source: 'github' },
    ], makeValidationResult('warning'));

    assert.ok(compat.level === 'experimental' || compat.level === 'risky');
    assert.ok(report.nextActions.length > 0);
    assert.ok(report.failurePoints.length > 0);
    assert.ok(report.nextActions.some((action) => /Start with|PS2|sleep|simulation/i.test(action.title) || /AppleALC|layout-id|sleep|trackpad/i.test(action.detail)));
    assert.ok(report.decisions.some((decision) => decision.label === 'SMBIOS'));
    assert.ok(report.decisions.some((decision) => decision.label.includes('Kext · VoodooPS2Controller') && decision.source === 'community'));
    assert.ok(['High confidence', 'Medium confidence', 'Low confidence'].includes(report.confidenceLabel));

    const html = renderToStaticMarkup(React.createElement(EfiReportPanel, { report }));
    assert.match(html, /What To Try Next/);
    assert.match(html, /Most Likely Failure Points/);
    assert.match(html, /Decision Trace/);
    assert.match(html, /community|fallback|rule/);
  });

  test('validation results influence the advisory confidence score', () => {
    const profile = makeProfile({
      targetOS: 'macOS Big Sur 11',
    });
    const compat = checkCompatibility(profile);

    const passReport = generateEfiReport(profile, compat, undefined, makeValidationResult('pass'));
    const warningReport = generateEfiReport(profile, compat, undefined, makeValidationResult('warning'));

    assert.ok(passReport.confidenceScore > warningReport.confidenceScore);
  });
});
