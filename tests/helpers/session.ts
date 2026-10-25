import WebSocket from 'ws';

// Login sessions for tests (docs/auth-plan.md). API requests send "Authorization: Bearer mks_…";
// role headers are ignored by the backend.

export const API_BASE = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000/ws/auth';

// Must match ENTRANCE_KEY in .env.test (scripts/setup-test-env.js).
export const ENTRANCE_KEY = 'mke_test-entrance-key';
export const ENTRANCE_HEADERS = { authorization: `Bearer ${ENTRANCE_KEY}` };

// Second tag of test-admin-001, not in ADMIN_TAG_UIDS, so it works via Web NFC.
export const TEST_ADMIN_API_TAG = 'test-admin-api-tag';

export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

/** Logs in like a phone (Web NFC) and returns the session token. Retries while the backend starts. */
export const loginWithWebNfc = async (uid: string, attempts = 60): Promise<string> => {
  let lastError = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(`${API_BASE}/auth/webnfc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      const body = (await response.json()) as { data?: { token?: string }; error?: string };
      if (response.ok && body.data?.token) {
        return body.data.token;
      }
      lastError = `${response.status} ${body.error ?? ''}`;
      if (response.status !== 500 && response.status !== 404) {
        break;
      }
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Web NFC login for ${uid} failed: ${lastError}`);
};

/**
 * Logs in like the entrance kiosk: listens on the WebSocket with the entrance key, posts the scan
 * and exchanges the login code. Works for admin tags from ADMIN_TAG_UIDS too.
 */
export const loginAtEntrance = async (uid: string): Promise<string> => {
  const socket = new WebSocket(WS_URL);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    const helloReply = new Promise<void>((resolve) => socket.once('message', () => resolve()));
    socket.send(JSON.stringify({ type: 'hello', entranceKey: ENTRANCE_KEY }));
    await helloReply;

    const tagEvent = new Promise<{ loginCode?: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No tag event')), 5000);
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as { type?: string; uid?: string };
        if (message.type === 'tag' && message.uid === uid) {
          clearTimeout(timer);
          resolve(message as { loginCode?: string });
        }
      });
    });
    const scan = await fetch(`${API_BASE}/auth/tag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ENTRANCE_HEADERS },
      body: JSON.stringify({ type: 'tag', uid, source: 'manual' }),
    });
    if (!scan.ok) {
      throw new Error(`Scan failed: ${scan.status}`);
    }
    const event = await tagEvent;
    if (!event.loginCode) {
      throw new Error(`Tag ${uid} does not log in`);
    }
    const response = await fetch(`${API_BASE}/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: event.loginCode }),
    });
    const body = (await response.json()) as { data?: { token?: string } };
    if (!body.data?.token) {
      throw new Error(`Session exchange failed: ${response.status}`);
    }
    return body.data.token;
  } finally {
    socket.close();
  }
};

const cache = new Map<string, string>();

/** Headers of a Web NFC session for the member with this tag (cached per worker). */
export const headersForTag = async (uid: string): Promise<Record<string, string>> => {
  let token = cache.get(uid);
  if (!token) {
    token = await loginWithWebNfc(uid, 1);
    cache.set(uid, token);
  }
  return bearer(token);
};
