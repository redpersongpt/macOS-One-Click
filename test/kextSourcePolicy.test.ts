import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { resolveKextSourcePlan, type KextRegistryEntry } from '../electron/kextSourcePolicy.js';

describe('kextSourcePolicy', () => {
  test('accepts direct-download kexts without a GitHub API lookup', () => {
    const entry: KextRegistryEntry = {
      repo: 'example/direct',
      directUrl: 'https://example.com/Lilu.kext.zip',
      staticVersion: 'direct',
    };

    const result = resolveKextSourcePlan('Lilu.kext', entry, null, { directUrlReachable: true });

    assert.equal(result.route, 'direct');
    assert.equal(result.available, true);
    assert.equal(result.assetUrl, 'https://example.com/Lilu.kext.zip');
  });

  test('falls back to the bundled copy when GitHub lookup fails but embedded fallback exists', () => {
    const entry: KextRegistryEntry = {
      repo: 'acidanthera/Lilu',
      assetFilter: 'RELEASE',
      embeddedFallback: true,
    };

    const result = resolveKextSourcePlan('Lilu.kext', entry, { error: 'GitHub API rate limited' });

    assert.equal(result.route, 'embedded');
    assert.equal(result.available, true);
    assert.match(result.message, /bundled fallback/i);
  });

  test('returns an actionable failure when no network or embedded source exists', () => {
    const entry: KextRegistryEntry = {
      repo: 'example/missing',
      assetFilter: 'RELEASE',
    };

    const result = resolveKextSourcePlan('Missing.kext', entry, { error: 'HTTP 404' });

    assert.equal(result.route, 'failed');
    assert.equal(result.available, false);
    assert.match(result.message, /404/i);
  });
});
