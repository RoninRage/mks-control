import type { Equipment, SetEquipmentControlRequest } from '@mks-control/shared-types';
import { getApiBaseUrl } from 'src/utils/apiUrl';

// Which Shelly output powers a machine (admin only).

const request = async (path: string, init: RequestInit, fallback: string): Promise<Equipment> => {
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
    throw new Error(message);
  }
  return (await response.json()) as Equipment;
};

export const machineService = {
  setControl(equipmentId: string, control: SetEquipmentControlRequest): Promise<Equipment> {
    return request(
      `/equipment/${equipmentId}/control`,
      { method: 'PUT', body: JSON.stringify(control) },
      'Steuerung konnte nicht gespeichert werden'
    );
  },

  // Admin switches a running machine off remotely.
  async forceOff(equipmentId: string): Promise<void> {
    const response = await fetch(`${getApiBaseUrl()}/equipment/${equipmentId}/force-off`, {
      method: 'POST',
    });
    if (!response.ok) {
      let message = 'Abschalten fehlgeschlagen';
      try {
        message = ((await response.json()) as { error?: string }).error || message;
      } catch {
        // keep fallback
      }
      throw new Error(message);
    }
  },

  removeControl(equipmentId: string): Promise<Equipment> {
    return request(
      `/equipment/${equipmentId}/control`,
      { method: 'DELETE' },
      'Steuerung konnte nicht entfernt werden'
    );
  },
};
