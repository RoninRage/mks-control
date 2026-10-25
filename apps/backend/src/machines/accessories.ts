import { getDriver } from '../shelly/driver';
import type {
  EquipmentControl,
  MachineExtra,
  MachineExtraAction,
  MachineExtraRequest,
  MachineExtraState,
  MachineInterlock,
} from '../types/machine';
import {
  findComponent,
  findShellyDevice,
  invalidateDeviceStatus,
  readDeviceStatus,
  type StoredDevice,
} from './deviceStatus';

// Safety inputs ("interlocks") and extra controls of a machine (docs/shelly-plan.md, phase 5).

export interface InterlockReading {
  label: string;
  // null: input cannot be read (device offline, or input without on/off state).
  ok: boolean | null;
}

// Device docs per id, so the control loop does not query the database for every read.
export type DeviceLookup = (deviceId: string) => Promise<StoredDevice | null>;

export const cachedDeviceLookup = (): DeviceLookup => {
  const cache = new Map<string, Promise<StoredDevice | null>>();
  return (deviceId: string) => {
    let entry = cache.get(deviceId);
    if (!entry) {
      entry = findShellyDevice(deviceId);
      cache.set(deviceId, entry);
    }
    return entry;
  };
};

const readInterlock = async (
  interlock: MachineInterlock,
  lookup: DeviceLookup,
  fresh: boolean
): Promise<InterlockReading> => {
  const device = await lookup(interlock.deviceId);
  if (!device) {
    return { label: interlock.label, ok: null };
  }
  const status = await readDeviceStatus(device, { fresh });
  const input = findComponent(status, { kind: 'input', index: interlock.index });
  const closed = input?.inputState;
  if (!status.online || closed === null || closed === undefined) {
    return { label: interlock.label, ok: null };
  }
  return { label: interlock.label, ok: interlock.okWhen === 'closed' ? closed : !closed };
};

export const readInterlocks = async (
  control: EquipmentControl,
  lookup: DeviceLookup,
  options: { fresh?: boolean } = {}
): Promise<InterlockReading[]> =>
  Promise.all(
    (control.interlocks ?? []).map((i) => readInterlock(i, lookup, options.fresh ?? false))
  );

export const readExtras = async (
  control: EquipmentControl,
  lookup: DeviceLookup
): Promise<MachineExtraState[]> =>
  Promise.all(
    (control.extras ?? []).map(async (extra): Promise<MachineExtraState> => {
      const base = { id: extra.id, label: extra.label, kind: extra.kind };
      const device = await lookup(extra.deviceId);
      if (!device) {
        return { ...base, online: false };
      }
      const status = await readDeviceStatus(device);
      const component = findComponent(status, extra);
      return {
        ...base,
        online: status.online,
        on: component?.on,
        brightness: component?.brightness,
        coverState: component?.coverState,
        positionPct: component?.positionPct,
      };
    })
  );

const ACTIONS_BY_KIND: Record<MachineExtra['kind'], MachineExtraAction[]> = {
  switch: ['on', 'off'],
  light: ['on', 'off'],
  cover: ['open', 'close', 'stop'],
};

export const isValidExtraAction = (extra: MachineExtra, request: MachineExtraRequest): boolean => {
  if (!ACTIONS_BY_KIND[extra.kind].includes(request.action)) {
    return false;
  }
  if (request.brightness === undefined) {
    return true;
  }
  return (
    extra.kind === 'light' &&
    Number.isInteger(request.brightness) &&
    request.brightness >= 1 &&
    request.brightness <= 100
  );
};

// Throws the driver's error when the Shelly cannot be reached.
export const operateExtra = async (
  extra: MachineExtra,
  device: StoredDevice,
  request: MachineExtraRequest
): Promise<void> => {
  const driver = getDriver(device.gen);
  switch (extra.kind) {
    case 'switch':
      await driver.setSwitch(device.host, extra.index, request.action === 'on');
      break;
    case 'light':
      await driver.setLight(device.host, extra.index, request.action === 'on', request.brightness);
      break;
    case 'cover':
      await driver.setCover(device.host, extra.index, request.action as 'open' | 'close' | 'stop');
      break;
  }
  invalidateDeviceStatus(device.id);
};

// When the release ends: switch off extras marked "mit Maschine ausschalten" (best effort).
export const switchOffExtras = async (
  control: EquipmentControl,
  lookup: DeviceLookup
): Promise<void> => {
  const targets = (control.extras ?? []).filter(
    (extra) => extra.offWithMachine && extra.kind !== 'cover'
  );
  await Promise.all(
    targets.map(async (extra) => {
      const device = await lookup(extra.deviceId);
      if (!device) {
        return;
      }
      try {
        await operateExtra(extra, device, { action: 'off' });
      } catch (err) {
        console.warn(
          `[machines] Could not switch off extra "${extra.label}": ${(err as Error).message}`
        );
      }
    })
  );
};
