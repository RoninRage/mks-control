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

  removeControl(equipmentId: string): Promise<Equipment> {
    return request(
      `/equipment/${equipmentId}/control`,
      { method: 'DELETE' },
      'Steuerung konnte nicht entfernt werden'
    );
  },
};
