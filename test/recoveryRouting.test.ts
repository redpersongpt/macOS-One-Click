import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { resolveBackToSafetyStep, resolveRecoveryRetryAction } from '../src/lib/recoveryRouting.js';

describe('recovery routing', () => {
  test('Back to Safety always lands on a stable non-destructive screen', () => {
    assert.equal(resolveBackToSafetyStep({ hasProfile: true }), 'report');
    assert.equal(resolveBackToSafetyStep({ hasProfile: false }), 'landing');
  });

  test('Retry maps transient build failures to guarded rebuild actions', () => {
    assert.deepEqual(resolveRecoveryRetryAction({
      targetStep: 'building',
      hasProfile: true,
      hasMethod: true,
      buildReady: false,
    }), { kind: 'restart_build' });

    assert.deepEqual(resolveRecoveryRetryAction({
      targetStep: 'kext-fetch',
      hasProfile: true,
      hasMethod: true,
      buildReady: false,
    }), { kind: 'restart_build' });

    assert.deepEqual(resolveRecoveryRetryAction({
      targetStep: 'recovery-download',
      hasProfile: true,
      hasMethod: true,
      buildReady: false,
    }), { kind: 'restart_build' });
  });

  test('Retry never routes unsupported recovery states directly into deploy steps', () => {
    assert.deepEqual(resolveRecoveryRetryAction({
      targetStep: 'method-select',
      hasProfile: true,
      hasMethod: false,
      buildReady: true,
    }), { kind: 'noop' });

    assert.deepEqual(resolveRecoveryRetryAction({
      targetStep: 'flashing',
      hasProfile: true,
      hasMethod: true,
      buildReady: true,
    }), { kind: 'noop' });

    assert.deepEqual(resolveRecoveryRetryAction({
      targetStep: null,
      hasProfile: false,
      hasMethod: false,
      buildReady: false,
    }), { kind: 'noop' });
  });
});
