import { describe, it, expect } from 'vitest';
import { resolveKextSourcePlan } from '../electron/kextSourcePolicy.js';
import type { KextRegistryEntry, KextReleaseProbe } from '../electron/kextSourcePolicy.js';

describe('resolveKextSourcePlan — 5-route resolution', () => {
  // ─── Route: bundled ──────────────────────────────────────────────────────

  it('returns bundled when entry is undefined', () => {
    const result = resolveKextSourcePlan('Lilu.kext', undefined);
    expect(result.route).toBe('bundled');
    expect(result.available).toBe(true);
    expect(result.version).toBe('bundled');
  });

  // ─── Route: direct ──────────────────────────────────────────────────────

  it('returns direct when entry has directUrl and no reachability issue', () => {
    const entry: KextRegistryEntry = {
      repo: 'acidanthera/bugtracker',
      directUrl: 'https://example.com/kext.zip',
      staticVersion: 'bugtracker',
    };
    const result = resolveKextSourcePlan('TestKext', entry);
    expect(result.route).toBe('direct');
    expect(result.available).toBe(true);
    expect(result.assetUrl).toBe('https://example.com/kext.zip');
    expect(result.version).toBe('bugtracker');
  });

  it('returns direct even with probe present (directUrl takes priority)', () => {
    const entry: KextRegistryEntry = {
      repo: 'acidanthera/bugtracker',
      directUrl: 'https://example.com/kext.zip',
    };
    const probe: KextReleaseProbe = {
      version: '1.0.0',
      assetUrl: 'https://github.com/release/asset.zip',
    };
    const result = resolveKextSourcePlan('TestKext', entry, probe);
    expect(result.route).toBe('direct');
  });

  // ─── Route: direct → embedded fallback ──────────────────────────────────

  it('falls back to embedded when directUrl is unreachable and embeddedFallback is true', () => {
    const entry: KextRegistryEntry = {
      repo: 'acidanthera/bugtracker',
      directUrl: 'https://example.com/kext.zip',
      embeddedFallback: true,
    };
    const result = resolveKextSourcePlan('TestKext', entry, null, {
      directUrlReachable: false,
      directUrlError: 'Connection refused',
    });
    expect(result.route).toBe('embedded');
    expect(result.available).toBe(true);
    expect(result.assetUrl).toBeNull();
  });

  // ─── Route: direct → failed (no fallback) ──────────────────────────────

  it('returns failed when directUrl is unreachable and no embedded fallback', () => {
    const entry: KextRegistryEntry = {
      repo: 'acidanthera/bugtracker',
      directUrl: 'https://example.com/kext.zip',
    };
    const result = resolveKextSourcePlan('TestKext', entry, null, {
      directUrlReachable: false,
      directUrlError: 'Network error',
    });
    expect(result.route).toBe('failed');
    expect(result.available).toBe(false);
    expect(result.message).toContain('Network error');
  });

  // ─── Route: github ──────────────────────────────────────────────────────

  it('returns github when probe has assetUrl and entry has no directUrl', () => {
    const entry: KextRegistryEntry = { repo: 'acidanthera/Lilu' };
    const probe: KextReleaseProbe = {
      version: '1.6.7',
      assetUrl: 'https://github.com/acidanthera/Lilu/releases/download/1.6.7/Lilu-1.6.7-RELEASE.zip',
    };
    const result = resolveKextSourcePlan('Lilu.kext', entry, probe);
    expect(result.route).toBe('github');
    expect(result.available).toBe(true);
    expect(result.version).toBe('1.6.7');
    expect(result.assetUrl).toContain('Lilu');
  });

  // ─── Route: github → embedded fallback ──────────────────────────────────

  it('falls back to embedded when github probe fails and embeddedFallback is true', () => {
    const entry: KextRegistryEntry = { repo: 'acidanthera/Lilu', embeddedFallback: true };
    const probe: KextReleaseProbe = {
      version: null,
      assetUrl: null,
      error: 'Rate limited',
    };
    const result = resolveKextSourcePlan('Lilu.kext', entry, probe);
    expect(result.route).toBe('embedded');
    expect(result.available).toBe(true);
    expect(result.message).toContain('failed');
  });

  // ─── Route: failed (all routes exhausted) ───────────────────────────────

  it('returns failed when github probe fails and no embedded fallback', () => {
    const entry: KextRegistryEntry = { repo: 'acidanthera/Lilu' };
    const probe: KextReleaseProbe = {
      version: null,
      assetUrl: null,
      error: 'Not found',
    };
    const result = resolveKextSourcePlan('Lilu.kext', entry, probe);
    expect(result.route).toBe('failed');
    expect(result.available).toBe(false);
    expect(result.message).toContain('Not found');
  });

  it('returns failed with generic message when probe has no error', () => {
    const entry: KextRegistryEntry = { repo: 'acidanthera/Lilu' };
    const probe: KextReleaseProbe = { version: null, assetUrl: null };
    const result = resolveKextSourcePlan('Lilu.kext', entry, probe);
    expect(result.route).toBe('failed');
    expect(result.available).toBe(false);
    expect(result.message).toContain('No usable release asset');
  });

  // ─── Invariant: route is always one of the 5 values ─────────────────────

  it('route is always one of: bundled, github, direct, embedded, failed', () => {
    const validRoutes = ['bundled', 'github', 'direct', 'embedded', 'failed'];
    const cases = [
      resolveKextSourcePlan('Test', undefined),
      resolveKextSourcePlan('Test', { repo: 'a/b', directUrl: 'http://x' }),
      resolveKextSourcePlan('Test', { repo: 'a/b', directUrl: 'http://x', embeddedFallback: true }, null, { directUrlReachable: false }),
      resolveKextSourcePlan('Test', { repo: 'a/b' }, { assetUrl: 'http://x' }),
      resolveKextSourcePlan('Test', { repo: 'a/b', embeddedFallback: true }, { assetUrl: null }),
      resolveKextSourcePlan('Test', { repo: 'a/b' }, { assetUrl: null }),
    ];
    for (const c of cases) {
      expect(validRoutes).toContain(c.route);
    }
  });
});
