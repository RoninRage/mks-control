import type {
  ShellyDevice,
  ShellyDeviceStatus,
  ShellyProbeResult,
} from '@mks-control/shared-types';
import { getApiBaseUrl } from 'src/utils/apiUrl';

export interface ShellyProbeResponse extends ShellyProbeResult {
  existingDeviceId?: string;
}

const baseUrl = (): string => `${getApiBaseUrl()}/shelly/devices`;

const readError = async (response: Response, fallback: string): Promise<Error> => {
  try {
    const data = (await response.json()) as { error?: string };
    return new Error(data.error || fallback);
  } catch {
    return new Error(fallback);
  }
};

const request = async <T>(url: string, init: RequestInit, fallback: string): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    throw await readError(response, fallback);
  }
  return (await response.json()) as T;
};

export const shellyService = {
  getDevices(): Promise<ShellyDevice[]> {
    return request(baseUrl(), { method: 'GET' }, 'Geräte konnten nicht geladen werden');
  },

  probe(host: string): Promise<ShellyProbeResponse> {
    return request(
      `${baseUrl()}/probe`,
      { method: 'POST', body: JSON.stringify({ host }) },
      'Gerät konnte nicht geprüft werden'
    );
  },

  createDevice(host: string, name?: string): Promise<ShellyDevice> {
    return request(
      baseUrl(),
      { method: 'POST', body: JSON.stringify({ host, name }) },
      'Gerät konnte nicht angelegt werden'
    );
  },

  updateDevice(id: string, data: { name?: string; host?: string }): Promise<ShellyDevice> {
    return request(
      `${baseUrl()}/${id}`,
      { method: 'PUT', body: JSON.stringify(data) },
      'Gerät konnte nicht gespeichert werden'
    );
  },

  refreshDevice(id: string): Promise<ShellyDevice> {
    return request(
      `${baseUrl()}/${id}/refresh`,
      { method: 'POST' },
      'Gerät konnte nicht neu eingelesen werden'
    );
  },

  getStatus(id: string): Promise<ShellyDeviceStatus> {
    return request(`${baseUrl()}/${id}/status`, { method: 'GET' }, 'Status nicht verfügbar');
  },

  async identify(id: string): Promise<void> {
    await request(
      `${baseUrl()}/${id}/identify`,
      { method: 'POST' },
      'Identifizieren fehlgeschlagen'
    );
  },

  async retireDevice(id: string): Promise<void> {
    await request(`${baseUrl()}/${id}`, { method: 'DELETE' }, 'Ausmustern fehlgeschlagen');
  },
};
