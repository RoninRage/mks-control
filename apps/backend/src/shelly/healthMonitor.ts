import { getDatabase } from '../db/couchdb';
import { readDeviceStatus } from '../machines/deviceStatus';
import type { ShellyDevice, ShellyHealth } from '../types/shelly';

// Checks every active Shelly regularly (docs/shelly-plan.md, phase 6), stores online/offline
// and announces changes, so the admin pages update without polling each device themselves.

type StoredDevice = ShellyDevice & { _id: string; _rev: string };

const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

const intervalMs = (): number => {
  const value = Number(process.env.SHELLY_HEALTH_INTERVAL_MS);
  return Number.isFinite(value) && value > 0 ? value : 30_000;
};

let notifyHealth: (deviceId: string, health: ShellyHealth) => void = () => undefined;
let onBackOnline: (device: StoredDevice) => void = () => undefined;

export const setHealthNotifier = (
  notify: (deviceId: string, health: ShellyHealth) => void
): void => {
  notifyHealth = notify;
};

// Called when a device comes back online (e.g. to set up its webhooks again).
export const setBackOnlineHandler = (handler: (device: StoredDevice) => void): void => {
  onBackOnline = handler;
};

const checkDevice = async (device: StoredDevice): Promise<void> => {
  const status = await readDeviceStatus(device, { fresh: true });
  const health: ShellyHealth = status.online ? 'online' : 'offline';
  const now = Date.now();
  const lastSeen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
  const changed = health !== device.health;

  if (!changed && !(health === 'online' && now - lastSeen > LAST_SEEN_WRITE_INTERVAL_MS)) {
    return;
  }
  try {
    await getDatabase<ShellyDevice>().insert({
      ...device,
      health,
      ...(health === 'online' ? { lastSeenAt: new Date(now).toISOString() } : {}),
    });
  } catch (err) {
    // Someone else wrote the device meanwhile; the next round catches up.
    if ((err as { statusCode?: number }).statusCode !== 409) {
      throw err;
    }
  }
  if (changed) {
    console.log(`[shelly] ${device.name} is ${health}`);
    notifyHealth(device.id, health);
    if (health === 'online') {
      onBackOnline(device);
    }
  }
};

let running = false;

export const runHealthCheck = async (): Promise<void> => {
  if (running) {
    return;
  }
  running = true;
  try {
    const result = await getDatabase<ShellyDevice>().find({
      selector: { type: { $eq: 'shellyDevice' }, isActive: { $eq: true } },
      limit: 1000,
    });
    await Promise.all(
      (result.docs as StoredDevice[]).map((device) =>
        checkDevice(device).catch((err) =>
          console.error(`[shelly] Health check of ${device.name} failed:`, err)
        )
      )
    );
  } finally {
    running = false;
  }
};

let timer: ReturnType<typeof setInterval> | null = null;

export const startHealthMonitor = (): void => {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    void runHealthCheck();
  }, intervalMs());
  timer.unref();
};
