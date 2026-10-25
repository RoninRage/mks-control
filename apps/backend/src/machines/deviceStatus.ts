import { getDatabase } from '../db/couchdb';
import { getDriver } from '../shelly/driver';
import type { ShellyComponentStatus, ShellyDevice } from '../types/shelly';
import { machineTickMs } from './timing';

// Shelly device lookup and a short status cache shared by machine control, safety inputs
// and extra controls, so state polls and the control loop do not query a Shelly every time.

export type StoredDevice = ShellyDevice & { _id: string; _rev: string };

export const findShellyDevice = async (id: string): Promise<StoredDevice | null> => {
  const db = getDatabase<ShellyDevice>();
  const result = await db.find({
    selector: { type: { $eq: 'shellyDevice' }, id: { $eq: id }, isActive: { $eq: true } },
    limit: 1,
  });
  return (result.docs[0] as StoredDevice | undefined) ?? null;
};

export interface DeviceStatus {
  at: number;
  online: boolean;
  components: ShellyComponentStatus[];
}

const statusCacheMs = (): number => Math.min(3000, machineTickMs() * 2);
const statusCache = new Map<string, DeviceStatus>();

export const readDeviceStatus = async (
  device: ShellyDevice,
  options: { fresh?: boolean } = {}
): Promise<DeviceStatus> => {
  const cached = statusCache.get(device.id);
  if (!options.fresh && cached && Date.now() - cached.at < statusCacheMs()) {
    return cached;
  }
  let entry: DeviceStatus;
  try {
    const components = await getDriver(device.gen).getStatus(device.host, device.components);
    entry = { at: Date.now(), online: true, components };
  } catch {
    entry = { at: Date.now(), online: false, components: [] };
  }
  statusCache.set(device.id, entry);
  return entry;
};

// Call after switching something, so the next read shows the new state.
export const invalidateDeviceStatus = (deviceId: string): void => {
  statusCache.delete(deviceId);
};

export const findComponent = (
  status: DeviceStatus,
  ref: { kind: string; index: number }
): ShellyComponentStatus | undefined =>
  status.components.find((c) => c.kind === ref.kind && c.index === ref.index);
