import React from 'react';
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompatibilityReport } from '../electron/compatibility.js';
import type { CompatibilityMatrix } from '../electron/compatibilityMatrix.js';
import VersionStep from '../src/components/steps/VersionStep.js';

function makeReport(): CompatibilityReport {
  return {
    level: 'supported',
    strategy: 'canonical',
    confidence: 'high',
    explanation: 'Supported hardware.',
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
      score: 82,
      label: 'High confidence',
      explanation: 'High confidence.',
    },
    mostLikelyFailurePoints: [],
  };
}

function makeMatrix(): CompatibilityMatrix {
  return {
    recommendedVersion: 'macOS Tahoe 26',
    rows: [
      {
        versionId: '26',
        versionName: 'macOS Tahoe 26',
        icon: 'tahoe',
        numeric: 26,
        status: 'supported',
        reason: 'Best supported target.',
        recommended: true,
        reportLevel: 'supported',
      },
      {
        versionId: '15',
        versionName: 'macOS Sequoia 15',
        icon: 'sequoia',
        numeric: 15,
        status: 'experimental',
        reason: 'Older fallback target.',
        recommended: false,
        reportLevel: 'experimental',
      },
    ],
  };
}

describe('VersionStep', () => {
  test('uses simpler recommendation copy', () => {
    const html = renderToStaticMarkup(
      <VersionStep
        report={makeReport()}
        matrix={makeMatrix()}
        selectedVersion="macOS Sequoia 15"
        onSelect={() => {}}
        onUseRecommendedVersion={() => {}}
      />,
    );

    assert.match(html, /Recommended first build/);
    assert.match(html, /Switch to macOS Tahoe 26 for the cleanest first attempt\./);
    assert.doesNotMatch(html, /Best first build before you branch into extra fixes/);
  });
});
