import { createHash, randomBytes } from 'crypto';
import { ShellyAuthError, ShellyProtocolError, ShellyUnreachableError } from './errors';

// Small HTTP helper for talking to Shellys.
// Handles the timeout and both authentication schemes:
//   - Gen1: HTTP Basic
//   - Gen2+: HTTP Digest (SHA-256), user "admin"
// Credentials are only sent after the device asks for them (401 challenge).

const DEFAULT_TIMEOUT_MS = 3000;
// Gen2+ always uses "admin". Gen1 lets users pick a name, so it can be overridden.
const DIGEST_USER = 'admin';
const getBasicUser = (): string => process.env.SHELLY_GEN1_USER || 'admin';

export interface ShellyRequest {
  host: string;
  path: string; // including query string
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

const getPassword = (): string | undefined => {
  const password = process.env.SHELLY_PASSWORD;
  return password ? password : undefined;
};

const getTimeoutMs = (request: ShellyRequest): number => {
  if (request.timeoutMs) {
    return request.timeoutMs;
  }
  const fromEnv = Number(process.env.SHELLY_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
};

const hash = (algorithm: 'md5' | 'sha256', value: string): string =>
  createHash(algorithm).update(value).digest('hex');

// Parses `Digest realm="x", nonce="y", qop="auth", algorithm=SHA-256` into a map.
export const parseDigestChallenge = (header: string): Record<string, string> => {
  const params: Record<string, string> = {};
  const content = header.replace(/^Digest\s+/i, '');
  const regex = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return params;
};

export const buildDigestAuthorization = (
  challenge: Record<string, string>,
  method: string,
  uri: string,
  username: string,
  password: string,
  cnonce: string = randomBytes(8).toString('hex')
): string => {
  const algorithmName = (challenge.algorithm ?? 'MD5').toUpperCase();
  const algorithm = algorithmName === 'SHA-256' ? 'sha256' : 'md5';
  const realm = challenge.realm ?? '';
  const nonce = challenge.nonce ?? '';
  const qop = challenge.qop?.split(',')[0]?.trim();
  const nc = '00000001';

  const ha1 = hash(algorithm, `${username}:${realm}:${password}`);
  const ha2 = hash(algorithm, `${method}:${uri}`);
  const response = qop
    ? hash(algorithm, `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hash(algorithm, `${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `algorithm=${algorithmName}`,
    `response="${response}"`,
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) {
    parts.push(`opaque="${challenge.opaque}"`);
  }
  return `Digest ${parts.join(', ')}`;
};

const send = async (
  request: ShellyRequest,
  authorization?: string
): Promise<globalThis.Response> => {
  const method = request.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (authorization) {
    headers.Authorization = authorization;
  }

  try {
    return await fetch(`http://${request.host}${request.path}`, {
      method,
      headers,
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(getTimeoutMs(request)),
      redirect: 'manual',
    });
  } catch {
    throw new ShellyUnreachableError();
  }
};

/**
 * Sends a request and returns the parsed JSON body.
 * Throws ShellyUnreachableError, ShellyAuthError or ShellyProtocolError.
 */
export const shellyRequest = async <T>(request: ShellyRequest): Promise<T> => {
  let response = await send(request);

  if (response.status === 401) {
    const password = getPassword();
    const challenge = response.headers.get('www-authenticate') ?? '';
    if (!password || !challenge) {
      throw new ShellyAuthError();
    }

    let authorization: string;
    if (/^digest/i.test(challenge)) {
      authorization = buildDigestAuthorization(
        parseDigestChallenge(challenge),
        request.method ?? 'GET',
        request.path,
        DIGEST_USER,
        password
      );
    } else {
      authorization = `Basic ${Buffer.from(`${getBasicUser()}:${password}`).toString('base64')}`;
    }

    response = await send(request, authorization);
    if (response.status === 401) {
      throw new ShellyAuthError();
    }
  }

  if (!response.ok) {
    throw new ShellyProtocolError(`Gerät antwortet mit HTTP ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ShellyProtocolError();
  }
};
