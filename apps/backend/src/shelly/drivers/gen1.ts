import type {
  ShellyComponent,
  ShellyComponentStatus,
  ShellyFirmwareInfo,
  ShellyProbeResult,
} from '../../types/shelly';
import { ShellyProtocolError } from '../errors';
import { shellyRequest } from '../http';
import {
  asArray,
  asBoolean,
  asNumber,
  asString,
  isRecord,
  type CoverAction,
  type ShellyDriver,
  type ShellyInfoResponse,
} from './types';

// Driver for Gen1 Shellys (Shelly 1, 1PM, 2.5, Plug S, Dimmer, RGBW2, EM, 3EM, ...).
// REST API: /shelly, /settings, /status, /relay/N, /light/N, /roller/N.

// Gen1 models that report a `meters` entry but do not actually measure power.
const MODELS_WITHOUT_METERING = new Set(['SHSW-1', 'SHSW-21']);

const getStatusJson = async (host: string): Promise<Record<string, unknown>> => {
  const status = await shellyRequest<unknown>({ host, path: '/status' });
  if (!isRecord(status)) {
    throw new ShellyProtocolError();
  }
  return status;
};

const getSettingsJson = async (host: string): Promise<Record<string, unknown>> => {
  const settings = await shellyRequest<unknown>({ host, path: '/settings' });
  if (!isRecord(settings)) {
    throw new ShellyProtocolError();
  }
  return settings;
};

const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

// Gen1 counts relay/light energy in watt-minutes, emeters already in Wh.
const wattMinutesToWh = (value: unknown): number | undefined => {
  const wattMinutes = asNumber(value);
  return wattMinutes === undefined ? undefined : Math.round((wattMinutes / 60) * 100) / 100;
};

export const detectGen1Components = (
  model: string,
  settings: Record<string, unknown>,
  status: Record<string, unknown>
): ShellyComponent[] => {
  const components: ShellyComponent[] = [];
  const mode = asString(settings.mode);
  const meters = asArray(status.meters);
  const canMeter = !MODELS_WITHOUT_METERING.has(model);

  // In roller mode the relays drive the cover and must not be switched on their own.
  if (mode !== 'roller') {
    asArray(status.relays).forEach((_relay, index) => {
      components.push({
        kind: 'switch',
        index,
        hasPowerMeter: canMeter && meters[index] !== undefined,
      });
    });
  }

  asArray(status.rollers).forEach((roller, index) => {
    components.push({
      kind: 'cover',
      index,
      hasPowerMeter: asNumber(record(roller).power) !== undefined,
    });
  });

  asArray(status.lights).forEach((_light, index) => {
    components.push({ kind: 'light', index, hasPowerMeter: meters[index] !== undefined });
  });

  asArray(status.emeters).forEach((_emeter, index) => {
    components.push({ kind: 'meter', index, hasPowerMeter: true });
  });

  asArray(status.inputs).forEach((_input, index) => {
    components.push({ kind: 'input', index });
  });

  return components;
};

export const mapGen1Status = (
  components: ShellyComponent[],
  status: Record<string, unknown>
): ShellyComponentStatus[] => {
  const relays = asArray(status.relays);
  const meters = asArray(status.meters);
  const emeters = asArray(status.emeters);
  const lights = asArray(status.lights);
  const rollers = asArray(status.rollers);
  const inputs = asArray(status.inputs);

  return components.map((component): ShellyComponentStatus => {
    const { kind, index } = component;
    const meter = record(meters[index]);

    switch (kind) {
      case 'switch': {
        const relay = record(relays[index]);
        return {
          kind,
          index,
          on: asBoolean(relay.ison),
          ...(component.hasPowerMeter
            ? { powerW: asNumber(meter.power), energyWh: wattMinutesToWh(meter.total) }
            : {}),
        };
      }
      case 'light': {
        const light = record(lights[index]);
        return {
          kind,
          index,
          on: asBoolean(light.ison),
          brightness: asNumber(light.brightness) ?? asNumber(light.gain),
          ...(component.hasPowerMeter
            ? { powerW: asNumber(meter.power), energyWh: wattMinutesToWh(meter.total) }
            : {}),
        };
      }
      case 'cover': {
        const roller = record(rollers[index]);
        const position = asNumber(roller.current_pos);
        return {
          kind,
          index,
          coverState: asString(roller.state),
          positionPct: position !== undefined && position >= 0 ? position : undefined,
          powerW: asNumber(roller.power),
        };
      }
      case 'meter': {
        const emeter = record(emeters[index]);
        return {
          kind,
          index,
          powerW: asNumber(emeter.power),
          voltageV: asNumber(emeter.voltage),
          currentA: asNumber(emeter.current),
          energyWh: asNumber(emeter.total),
        };
      }
      case 'input': {
        const input = record(inputs[index]);
        const value = asNumber(input.input);
        return { kind, index, inputState: value === undefined ? null : value === 1 };
      }
    }
  });
};

const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  });
  return search.toString();
};

export const gen1Driver: ShellyDriver = {
  async probe(host: string): Promise<ShellyProbeResult> {
    const info = await shellyRequest<ShellyInfoResponse>({ host, path: '/shelly' });
    const model = asString(info.type);
    const mac = asString(info.mac);
    if (!model || !mac) {
      throw new ShellyProtocolError();
    }

    const settings = await getSettingsJson(host);
    const status = await getStatusJson(host);
    const device = record(settings.device);

    return {
      host,
      shellyId: asString(device.hostname) ?? `${model.toLowerCase()}-${mac}`,
      mac: mac.toUpperCase(),
      model,
      gen: 1,
      firmware: asString(info.fw) ?? asString(settings.fw),
      name: asString(settings.name),
      authRequired: info.auth === true,
      components: detectGen1Components(model, settings, status),
    };
  },

  async getStatus(host: string, known?: ShellyComponent[]): Promise<ShellyComponentStatus[]> {
    const status = await getStatusJson(host);
    if (known) {
      return mapGen1Status(known, status);
    }
    const info = await shellyRequest<ShellyInfoResponse>({ host, path: '/shelly' });
    const settings = await getSettingsJson(host);
    return mapGen1Status(detectGen1Components(asString(info.type) ?? '', settings, status), status);
  },

  async setSwitch(host, index, on, autoOffSec): Promise<void> {
    await shellyRequest({
      host,
      path: `/relay/${index}?${query({ turn: on ? 'on' : 'off', timer: autoOffSec })}`,
    });
  },

  async setLight(host, index, on, brightness, autoOffSec): Promise<void> {
    await shellyRequest({
      host,
      path: `/light/${index}?${query({ turn: on ? 'on' : 'off', brightness, timer: autoOffSec })}`,
    });
  },

  async checkFirmware(host: string): Promise<ShellyFirmwareInfo> {
    const status = await getStatusJson(host);
    const update = record(status.update);
    const hasUpdate = asBoolean(update.has_update) === true;
    return {
      current: asString(update.old_version),
      available: hasUpdate ? asString(update.new_version) : undefined,
      updating: asString(update.status) === 'updating',
    };
  },

  async updateFirmware(host: string): Promise<void> {
    await shellyRequest({ host, path: '/ota?update=true' });
  },

  async setCover(host, index, action: CoverAction | { positionPct: number }): Promise<void> {
    const params =
      typeof action === 'string'
        ? { go: action }
        : { go: 'to_pos', roller_pos: Math.round(action.positionPct) };
    await shellyRequest({ host, path: `/roller/${index}?${query(params)}` });
  },
};
