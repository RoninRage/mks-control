import type { AuthSessionInfo } from '@mks-control/shared-types';
import { getApiBaseUrl } from 'src/utils/apiUrl';

// Login calls (docs/auth-plan.md). They pass the token explicitly so they also work before or
// after the store holds it.

export class LoginError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

interface ApiAnswer<T> {
  ok?: boolean;
  data?: T;
  error?: string;
  code?: string;
}

const post = async <T>(path: string, body: unknown, token?: string): Promise<ApiAnswer<T>> => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => ({}))) as ApiAnswer<T>;
  if (!response.ok) {
    throw new LoginError(answer.error ?? 'Anmeldung fehlgeschlagen', response.status, answer.code);
  }
  return answer;
};

const sessionFrom = (answer: ApiAnswer<AuthSessionInfo>): AuthSessionInfo => {
  if (!answer.data?.token) {
    throw new LoginError('Anmeldung fehlgeschlagen', 500);
  }
  return answer.data;
};

export const authService = {
  /** Entrance kiosk: exchanges the one-time code from a scan for a session. */
  async exchangeLoginCode(code: string): Promise<AuthSessionInfo> {
    return sessionFrom(await post<AuthSessionInfo>('/auth/session', { code }));
  },

  /** Phone: logs in with the UID read via Web NFC. */
  async loginWithWebNfc(uid: string): Promise<AuthSessionInfo> {
    return sessionFrom(await post<AuthSessionInfo>('/auth/webnfc', { uid }));
  },

  /** Current session, 'ended' when it is no longer valid, null when the server is unreachable. */
  async me(token: string): Promise<AuthSessionInfo | 'ended' | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        return 'ended';
      }
      if (!response.ok) {
        return null;
      }
      const answer = (await response.json()) as ApiAnswer<AuthSessionInfo>;
      return answer.data ?? null;
    } catch {
      return null;
    }
  },

  /** Activity at the kiosk: keeps the session from timing out. */
  async ping(token: string): Promise<void> {
    await post('/auth/ping', {}, token).catch(() => undefined);
  },

  /** Ends the session in the backend (writes the audit entry). Never throws. */
  async logout(token: string, reason = 'user-initiated'): Promise<void> {
    try {
      await post('/auth/logout', { reason }, token);
    } catch (error) {
      console.warn('[authService] Logout failed:', error);
    }
  },
};
