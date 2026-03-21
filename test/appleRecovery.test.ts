import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
  APPLE_RECOVERY_IMAGE_URL,
  APPLE_RECOVERY_ROOT_URL,
  INTERNET_RECOVERY_USER_AGENT,
  buildAppleRecoveryDownloadHeaders,
  buildAppleRecoveryQueryBody,
  parseAppleRecoveryAssetInfo,
  probeAppleRecoveryEndpoint,
  queryAppleRecoveryAssets,
  type AppleRecoveryHttpResponse,
  type AppleRecoveryTransport,
} from '../electron/appleRecovery.js';

describe('apple recovery protocol', () => {
  test('builds the upstream newline-separated request body', () => {
    const body = buildAppleRecoveryQueryBody({
      boardId: 'Mac-827FAC58A8FDFA22',
      mlb: '00000000000000000',
      cid: '0123456789ABCDEF',
      k: 'A'.repeat(64),
      fg: 'B'.repeat(64),
      osType: 'default',
    });

    assert.equal(
      body,
      [
        'cid=0123456789ABCDEF',
        'sn=00000000000000000',
        'bid=Mac-827FAC58A8FDFA22',
        `k=${'A'.repeat(64)}`,
        `fg=${'B'.repeat(64)}`,
        'os=default',
      ].join('\n'),
    );
  });

  test('parses Apple colon-delimited recovery responses and preserves asset tokens', () => {
    const parsed = parseAppleRecoveryAssetInfo([
      'AP: 696-08090',
      'AU: http://oscdn.apple.com/BaseSystem.dmg',
      'AH: HASH',
      'AT: expires=123~access=/BaseSystem.dmg~md5=abc',
      'CU: http://oscdn.apple.com/BaseSystem.chunklist',
      'CH: HASH2',
      'CT: expires=123~access=/BaseSystem.chunklist~md5=def',
      '',
    ].join('\n'));

    assert.equal(parsed.product, '696-08090');
    assert.equal(parsed.dmgUrl, 'http://oscdn.apple.com/BaseSystem.dmg');
    assert.equal(parsed.dmgToken, 'expires=123~access=/BaseSystem.dmg~md5=abc');
    assert.equal(parsed.chunklistUrl, 'http://oscdn.apple.com/BaseSystem.chunklist');
    assert.equal(parsed.chunklistToken, 'expires=123~access=/BaseSystem.chunklist~md5=def');
  });

  test('queries Apple recovery using session bootstrap and InternetRecovery headers', async () => {
    const requests: Array<{ url: string; method?: string; headers?: Record<string, string>; body?: string }> = [];
    const transport: AppleRecoveryTransport = async (input) => {
      requests.push(input);
      if (input.url === APPLE_RECOVERY_ROOT_URL) {
        return {
          statusCode: 200,
          headers: {
            'set-cookie': 'session=test-session; Domain=osrecovery.apple.com; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      if (input.url === APPLE_RECOVERY_IMAGE_URL) {
        return {
          statusCode: 200,
          headers: {},
          body: [
            'AP: 696-08090',
            'AU: http://oscdn.apple.com/BaseSystem.dmg',
            'AH: HASH',
            'AT: token-dmg',
            'CU: http://oscdn.apple.com/BaseSystem.chunklist',
            'CH: HASH2',
            'CT: token-cl',
          ].join('\n'),
        };
      }
      throw new Error(`Unexpected URL: ${input.url}`);
    };

    const result = await queryAppleRecoveryAssets(
      { boardId: 'Mac-827FAC58A8FDFA22', osType: 'default' },
      transport,
    );

    assert.equal(result.dmgToken, 'token-dmg');
    assert.equal(result.chunklistToken, 'token-cl');
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, APPLE_RECOVERY_ROOT_URL);
    assert.equal(requests[0]?.method, 'GET');
    assert.equal(requests[0]?.headers?.['User-Agent'], INTERNET_RECOVERY_USER_AGENT);
    assert.equal(requests[1]?.url, APPLE_RECOVERY_IMAGE_URL);
    assert.equal(requests[1]?.headers?.Cookie, 'session=test-session');
    assert.equal(requests[1]?.headers?.['User-Agent'], INTERNET_RECOVERY_USER_AGENT);
    assert.match(requests[1]?.body ?? '', /^cid=[0-9A-F]{16}\nsn=00000000000000000\nbid=Mac-827FAC58A8FDFA22\nk=[0-9A-F]{64}\nfg=[0-9A-F]{64}\nos=default$/);
  });

  test('reports endpoint reachability from the session bootstrap instead of a malformed POST probe', async () => {
    const requests: string[] = [];
    const transport: AppleRecoveryTransport = async (input) => {
      requests.push(input.url);
      return {
        statusCode: 200,
        headers: {
          'set-cookie': 'session=test-session; Domain=osrecovery.apple.com; Path=/; HttpOnly',
        },
        body: '',
      };
    };

    const result = await probeAppleRecoveryEndpoint(transport);

    assert.equal(result.reachable, true);
    assert.equal(result.sessionCookie, 'session=test-session');
    assert.deepEqual(requests, [APPLE_RECOVERY_ROOT_URL]);
  });

  test('formats download headers with the required asset token cookie', () => {
    assert.deepEqual(buildAppleRecoveryDownloadHeaders('token-value'), {
      'User-Agent': INTERNET_RECOVERY_USER_AGENT,
      'Cookie': 'AssetToken=token-value',
    });
  });
});
