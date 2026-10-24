import type {
  CreateTerminalRequest,
  TerminalState,
  TerminalSummary,
  TerminalTokenResponse,
  UpdateTerminalRequest,
} from '@mks-control/shared-types';
import { getApiBaseUrl } from 'src/utils/apiUrl';

// Admin API (/api/terminals) and the Pi's own API (/api/terminal).
// The terminal key is added by boot/fetch-headers.ts in kiosk mode, or passed explicitly
// when a key is being checked during setup.

export class TerminalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'TerminalApiError';
  }
}

const request = async <T>(path: string, init: RequestInit, fallback: string): Promise<T> => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    let message = fallback;
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error || fallback;
    } catch {
      // keep fallback
    }
    throw new TerminalApiError(message, response.status);
  }
  return (await response.json()) as T;
};

export const terminalAdminService = {
  list(): Promise<TerminalSummary[]> {
    return request('/terminals', { method: 'GET' }, 'Terminals konnten nicht geladen werden');
  },

  create(data: CreateTerminalRequest): Promise<TerminalTokenResponse> {
    return request(
      '/terminals',
      { method: 'POST', body: JSON.stringify(data) },
      'Terminal konnte nicht angelegt werden'
    );
  },

  update(id: string, data: UpdateTerminalRequest): Promise<TerminalSummary> {
    return request(
      `/terminals/${id}`,
      { method: 'PUT', body: JSON.stringify(data) },
      'Terminal konnte nicht gespeichert werden'
    );
  },

  rotateToken(id: string): Promise<TerminalTokenResponse> {
    return request(
      `/terminals/${id}/rotate-token`,
      { method: 'POST' },
      'Schlüssel konnte nicht erneuert werden'
    );
  },

  async remove(id: string): Promise<void> {
    await request(
      `/terminals/${id}`,
      { method: 'DELETE' },
      'Terminal konnte nicht gelöscht werden'
    );
  },
};

export const terminalClientService = {
  // tokenOverride: check a key before it is saved (setup screen).
  getState(tokenOverride?: string): Promise<TerminalState> {
    return request(
      '/terminal/state',
      {
        method: 'GET',
        headers: tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : {},
      },
      'Status konnte nicht geladen werden'
    );
  },

  release(): Promise<TerminalState> {
    return request('/terminal/release', { method: 'POST' }, 'Freigabe fehlgeschlagen');
  },

  stillThere(): Promise<TerminalState> {
    return request('/terminal/still-there', { method: 'POST' }, 'Bestätigung fehlgeschlagen');
  },

  logout(): Promise<TerminalState> {
    return request('/terminal/logout', { method: 'POST' }, 'Abmelden fehlgeschlagen');
  },

  async activity(): Promise<void> {
    await request('/terminal/activity', { method: 'POST' }, 'Aktivität nicht gemeldet');
  },
};
