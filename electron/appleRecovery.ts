import * as http from 'node:http';
import * as https from 'node:https';

export const APPLE_RECOVERY_HOST = 'osrecovery.apple.com';
export const INTERNET_RECOVERY_USER_AGENT = 'InternetRecovery/1.0';
export const APPLE_RECOVERY_ROOT_URL = `http://${APPLE_RECOVERY_HOST}/`;
export const APPLE_RECOVERY_IMAGE_URL = `http://${APPLE_RECOVERY_HOST}/InstallationPayload/RecoveryImage`;
export const APPLE_RECOVERY_MLB_ZERO = '00000000000000000';

export interface AppleRecoveryEndpointProbeResult {
  reachable: boolean;
  httpCode: number | null;
  sessionCookie: string | null;
}

export interface AppleRecoveryAssetInfo {
  product: string;
  dmgUrl: string;
  dmgToken: string;
  chunklistUrl: string;
  chunklistToken: string;
}

export interface AppleRecoveryHttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export type AppleRecoveryTransport = (input: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}) => Promise<AppleRecoveryHttpResponse>;

function randomHex(length: number): string {
  const alphabet = '0123456789ABCDEF';
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function readSessionCookie(
  header: string | string[] | undefined,
): string | null {
  if (!header) return null;
  const values = Array.isArray(header) ? header : [header];
  for (const value of values) {
    for (const part of value.split('; ')) {
      if (part.startsWith('session=')) {
        return part;
      }
    }
  }
  return null;
}

export function buildAppleRecoveryQueryBody(input: {
  boardId: string;
  mlb?: string;
  cid?: string;
  k?: string;
  fg?: string;
  osType?: string;
}): string {
  const payload = {
    cid: input.cid ?? randomHex(16),
    sn: input.mlb ?? APPLE_RECOVERY_MLB_ZERO,
    bid: input.boardId,
    k: input.k ?? randomHex(64),
    fg: input.fg ?? randomHex(64),
    os: input.osType ?? 'default',
  };

  return Object.entries(payload)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function parseAppleRecoveryAssetInfo(body: string): AppleRecoveryAssetInfo {
  const info: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const separator = line.indexOf(': ');
    if (separator <= 0) continue;
    info[line.slice(0, separator).trim()] = line.slice(separator + 2).trim();
  }

  const product = info.AP;
  const dmgUrl = info.AU;
  const dmgToken = info.AT;
  const chunklistUrl = info.CU;
  const chunklistToken = info.CT;

  if (!product || !dmgUrl || !dmgToken || !chunklistUrl || !chunklistToken) {
    throw new Error('APPLE_EMPTY_RESPONSE');
  }

  return {
    product,
    dmgUrl,
    dmgToken,
    chunklistUrl,
    chunklistToken,
  };
}

export function buildAppleRecoveryDownloadHeaders(assetToken: string): Record<string, string> {
  return {
    'User-Agent': INTERNET_RECOVERY_USER_AGENT,
    'Cookie': `AssetToken=${assetToken}`,
  };
}

export async function createAppleRecoveryTransport(input: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}): Promise<AppleRecoveryHttpResponse> {
  const parsed = new URL(input.url);
  const client = parsed.protocol === 'https:' ? https : http;
  const method = input.method ?? (input.body ? 'POST' : 'GET');

  return new Promise((resolve, reject) => {
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: input.headers,
      timeout: input.timeoutMs ?? 15000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf-8');
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body,
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    if (input.body) {
      req.write(input.body);
    }
    req.end();
  });
}

export async function probeAppleRecoveryEndpoint(
  transport: AppleRecoveryTransport = createAppleRecoveryTransport,
): Promise<AppleRecoveryEndpointProbeResult> {
  try {
    const response = await transport({
      url: APPLE_RECOVERY_ROOT_URL,
      method: 'GET',
      headers: {
        'Host': APPLE_RECOVERY_HOST,
        'Connection': 'close',
        'User-Agent': INTERNET_RECOVERY_USER_AGENT,
      },
      timeoutMs: 10000,
    });

    return {
      reachable: response.statusCode > 0 && response.statusCode < 500,
      httpCode: response.statusCode,
      sessionCookie: readSessionCookie(response.headers['set-cookie']) ?? readSessionCookie(response.headers['Set-Cookie']),
    };
  } catch {
    return {
      reachable: false,
      httpCode: null,
      sessionCookie: null,
    };
  }
}

export async function queryAppleRecoveryAssets(
  input: {
    boardId: string;
    mlb?: string;
    osType?: string;
  },
  transport: AppleRecoveryTransport = createAppleRecoveryTransport,
): Promise<AppleRecoveryAssetInfo> {
  const session = await probeAppleRecoveryEndpoint(transport);
  if (!session.reachable) {
    throw new Error('CONN_ERR:bootstrap_unreachable');
  }
  if (!session.sessionCookie) {
    throw new Error('APPLE_EMPTY_SESSION');
  }

  const body = buildAppleRecoveryQueryBody({
    boardId: input.boardId,
    mlb: input.mlb,
    osType: input.osType,
  });

  const response = await transport({
    url: APPLE_RECOVERY_IMAGE_URL,
    method: 'POST',
    headers: {
      'Host': APPLE_RECOVERY_HOST,
      'Connection': 'close',
      'User-Agent': INTERNET_RECOVERY_USER_AGENT,
      'Cookie': session.sessionCookie,
      'Content-Type': 'text/plain',
    },
    body,
    timeoutMs: 15000,
  });

  if (response.statusCode === 401 || response.statusCode === 403) {
    throw new Error(`APPLE_AUTH_REJECT:${response.statusCode}`);
  }
  if (response.statusCode === 429) {
    throw new Error('APPLE_RATE_LIMIT:429');
  }
  if (response.statusCode >= 500) {
    throw new Error(`APPLE_SERVER_ERROR:${response.statusCode}`);
  }
  if (response.statusCode !== 200) {
    throw new Error(`APPLE_HTTP:${response.statusCode}`);
  }

  return parseAppleRecoveryAssetInfo(response.body);
}
