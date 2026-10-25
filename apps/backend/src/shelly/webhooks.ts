import { randomBytes, timingSafeEqual } from 'crypto';
import { getDatabase } from '../db/couchdb';
import type { Equipment } from '../types/equipment';
import type { ShellyDevice, ShellyPushStatus } from '../types/shelly';
import { isRecord } from './drivers/types';
import { rpc } from './drivers/gen2';

// Push from the Shelly for safety inputs (docs/shelly-plan.md, phase 6).
//
// Gen2+ devices get webhooks for "input.toggle_on/off" that call
// <SHELLY_CALLBACK_URL>/api/shelly/events/<deviceId>?key=<eventKey>. The backend then checks
// the affected machines immediately instead of waiting for the next poll. Polling stays as the
// fallback. Gen1 devices are only polled. Without SHELLY_CALLBACK_URL nothing is set up.

type StoredDevice = ShellyDevice & { _id: string; _rev: string };

// Our webhooks are recognised by this name prefix; others on the device are left alone.
const HOOK_PREFIX = 'mks_';
const INPUT_EVENTS = ['input.toggle_on', 'input.toggle_off'];

export const getCallbackBaseUrl = (): string | null => {
  const value = (process.env.SHELLY_CALLBACK_URL ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(value) ? value : null;
};

export const eventKeyMatches = (device: ShellyDevice, key: unknown): boolean => {
  if (!device.eventKey || typeof key !== 'string') {
    return false;
  }
  const expected = Buffer.from(device.eventKey);
  const given = Buffer.from(key);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

const saveDevice = async (device: StoredDevice, patch: Partial<ShellyDevice>): Promise<void> => {
  const db = getDatabase<ShellyDevice>();
  let current = device;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.insert({ ...current, ...patch });
      return;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) {
        throw err;
      }
      current = (await db.get(device._id)) as StoredDevice;
    }
  }
};

const removeOurHooks = async (device: ShellyDevice): Promise<void> => {
  const list = await rpc(device.host, 'Webhook.List');
  const hooks = isRecord(list) && Array.isArray(list.hooks) ? list.hooks : [];
  for (const hook of hooks) {
    if (isRecord(hook) && typeof hook.name === 'string' && hook.name.startsWith(HOOK_PREFIX)) {
      await rpc(device.host, 'Webhook.Delete', { id: hook.id });
    }
  }
};

/**
 * Sets up (or removes) the input webhooks of one device. inputIndexes = inputs used as
 * safety inputs on this device; empty removes our webhooks.
 */
export const syncDeviceWebhooks = async (
  device: StoredDevice,
  inputIndexes: number[]
): Promise<void> => {
  const base = getCallbackBaseUrl();
  if (!base) {
    return;
  }
  if (device.gen < 2) {
    if (inputIndexes.length > 0 && device.push?.state !== 'unsupported') {
      await saveDevice(device, {
        push: { state: 'unsupported', at: new Date().toISOString() },
      });
    }
    return;
  }
  if (inputIndexes.length === 0 && !device.push) {
    return;
  }

  const eventKey = device.eventKey ?? randomBytes(24).toString('base64url');
  let push: ShellyPushStatus | undefined;
  try {
    await removeOurHooks(device);
    const url = `${base}/api/shelly/events/${encodeURIComponent(device.id)}?key=${eventKey}`;
    for (const index of inputIndexes) {
      for (const event of INPUT_EVENTS) {
        await rpc(device.host, 'Webhook.Create', {
          cid: index,
          enable: true,
          event,
          name: `${HOOK_PREFIX}input${index}_${event.endsWith('on') ? 'on' : 'off'}`,
          urls: [url],
        });
      }
    }
    push = inputIndexes.length > 0 ? { state: 'active', at: new Date().toISOString() } : undefined;
  } catch (err) {
    push = { state: 'error', at: new Date().toISOString(), error: (err as Error).message };
    console.warn(`[shelly] Webhooks for ${device.name} failed: ${(err as Error).message}`);
  }
  await saveDevice(device, { eventKey, push });
};

// Inputs used as safety inputs, per device, over all machines.
const interlockInputsByDevice = async (): Promise<Map<string, number[]>> => {
  const result = await getDatabase<Equipment>().find({
    selector: { type: { $eq: 'equipment' }, 'control.interlocks': { $exists: true } },
    limit: 5000,
  });
  const map = new Map<string, Set<number>>();
  for (const equipment of result.docs) {
    if (equipment.isActive === false) {
      continue;
    }
    for (const interlock of equipment.control?.interlocks ?? []) {
      const set = map.get(interlock.deviceId) ?? new Set<number>();
      set.add(interlock.index);
      map.set(interlock.deviceId, set);
    }
  }
  return new Map([...map.entries()].map(([id, set]) => [id, [...set].sort((a, b) => a - b)]));
};

/**
 * Brings the webhooks of all devices in line with the configured safety inputs.
 * Runs at startup, after the machine control config changes and when a device comes back.
 */
export const syncAllWebhooks = async (onlyDeviceId?: string): Promise<void> => {
  if (!getCallbackBaseUrl()) {
    return;
  }
  const inputs = await interlockInputsByDevice();
  const devices = await getDatabase<ShellyDevice>().find({
    selector: { type: { $eq: 'shellyDevice' }, isActive: { $eq: true } },
    limit: 1000,
  });
  for (const device of devices.docs as StoredDevice[]) {
    if (onlyDeviceId && device.id !== onlyDeviceId) {
      continue;
    }
    try {
      await syncDeviceWebhooks(device, inputs.get(device.id) ?? []);
    } catch (err) {
      console.error(`[shelly] Webhook sync for ${device.name} failed:`, err);
    }
  }
};
