import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildStartupFailurePageUrl,
  describeStartupFailure,
  shouldIgnoreDidFailLoad,
} from '../electron/startupRecovery.js';
import type { PublicDiagnosticsSnapshot } from '../electron/releaseDiagnostics.js';

function makeSnapshot(): PublicDiagnosticsSnapshot {
  return {
    version: '2.3.0',
    platform: 'darwin',
    arch: 'arm64',
    compatMode: 'none',
    timestamp: '2026-03-20T12:00:00.000Z',
    sessionFingerprint: 'abc123def456',
    trigger: 'startup_failure',
    lastTaskKind: null,
    lastTaskStatus: null,
    lastError: 'Renderer navigation failed.',
    hardware: 'Hardware scan not completed',
    confidence: 'Not yet scanned',
    firmware: 'Not probed',
    compatibilityState: null,
    failedKexts: [],
    kextSources: {},
    diskContext: {
      selectedDevice: null,
      partitionTable: null,
      isSystemDisk: null,
      identityConfidence: null,
      identityFields: [],
      identityFingerprint: null,
    },
    validationSummary: null,
    recoveryStats: {
      attempts: 0,
      lastHttpCode: null,
      lastError: null,
      decision: null,
      source: 'none',
    },
    recentLogs: [],
    lastFailure: null,
  };
}

describe('startup recovery helpers', () => {
  test('ignores non-main-frame and aborted did-fail-load events', () => {
    assert.equal(shouldIgnoreDidFailLoad({
      errorCode: -3,
      errorDescription: 'ERR_ABORTED',
      validatedURL: 'file:///app/dist/index.html',
      isMainFrame: true,
    }), true);

    assert.equal(shouldIgnoreDidFailLoad({
      errorCode: -6,
      errorDescription: 'ERR_FILE_NOT_FOUND',
      validatedURL: 'file:///app/dist/assets/index.js',
      isMainFrame: false,
    }), true);

    assert.equal(shouldIgnoreDidFailLoad({
      errorCode: -6,
      errorDescription: 'ERR_FILE_NOT_FOUND',
      validatedURL: 'file:///app/dist/index.html',
      isMainFrame: true,
    }), false);
  });

  test('describes renderer boot timeout in human-readable terms', () => {
    const descriptor = describeStartupFailure({
      kind: 'renderer_boot_timeout',
      diagnostics: makeSnapshot(),
      issueDraft: {
        title: 'title',
        body: 'body',
        trigger: 'startup_failure',
      },
      detail: 'Renderer ready handshake timed out.',
    });

    assert.match(descriptor.summary, /never reported itself ready/i);
    assert.match(descriptor.likelyCause, /preload bridge or renderer bootstrap/i);
    assert.match(descriptor.failureMessage, /timed out/i);
  });

  test('builds a clean fallback page with recovery actions and sanitized diagnostics', () => {
    const url = buildStartupFailurePageUrl({
      kind: 'did_fail_load',
      diagnostics: makeSnapshot(),
      issueDraft: {
        title: '[BUG][STARTUP_FAILURE] Renderer navigation failed',
        body: 'sanitized report body',
        trigger: 'startup_failure',
      },
      retryTargetUrl: 'file:///Applications/macOS-OneClick.app/Contents/Resources/app.asar/dist/index.html',
      safeTargetUrl: 'file:///Applications/macOS-OneClick.app/Contents/Resources/app.asar/dist/index.html?safe-recovery=1',
      errorCode: -6,
      errorDescription: 'ERR_FILE_NOT_FOUND',
      validatedURL: 'file:///Applications/alice/macOS-OneClick/dist/index.html',
    });

    const html = decodeURIComponent(url.replace('data:text/html;charset=UTF-8,', ''));
    assert.match(html, /Startup Recovery/);
    assert.match(html, /Retry/);
    assert.match(html, /Copy Report/);
    assert.match(html, /Open Issue/);
    assert.match(html, /Back to Safety/);
    assert.equal(html.includes('/Applications/alice'), false);
  });
});
