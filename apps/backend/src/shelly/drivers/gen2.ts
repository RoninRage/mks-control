import type {
  ShellyComponent,
  ShellyComponentKind,
  ShellyComponentStatus,
  ShellyProbeResult,
} from '../../types/shelly';
import { ShellyProtocolError } from '../errors';
import { shellyRequest } from '../http';
import {
  asBoolean,
  asNumber,
  asString,
  isRecord,
  type CoverAction,
  type ShellyDriver,
  type ShellyInfoResponse,
} from './types';

// Driver for Gen2+ Shellys (Plus, Pro, Mini, Gen3, Gen4). They share one JSON-RPC API:
// POST /rpc { id, method, params }. Components show up in Shelly.GetStatus as "<type>:<id>".

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: unknown;
}

let rpcId = 0;

export const rpc = async (
  host: string,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> => {
  rpcId = (rpcId + 1) % 1_000_000;
  const response = await shellyRequest<RpcResponse>({
    host,
    path: '/rpc',
    method: 'POST',
    body: { id: rpcId, method, params: params ?? {} },
  });

  if (!isRecord(response)) {
    throw new ShellyProtocolError();
  }
  if (isRecord(response.error)) {
    const detail = asString(response.error.message) ?? asNumber(response.error.code);
    throw new ShellyProtocolError(`Gerät meldet Fehler: ${detail ?? 'unbekannt'}`);
  }
  return response.result;
};

// Maps a GetStatus key prefix to our component kind.
const KIND_BY_PREFIX: Record<string, ShellyComponentKind> = {
  switch: 'switch',
  input: 'input',
  light: 'light',
  cover: 'cover',
  pm1: 'meter',
  em1: 'meter',
  em: 'meter',
};

interface StatusEntry {
  prefix: string;
  kind: ShellyComponentKind;
  index: number;
  data: Record<string, unknown>;
}

const parseStatusEntries = (status: Record<string, unknown>): StatusEntry[] => {
  const entries: StatusEntry[] = [];
  Object.entries(status).forEach(([key, data]) => {
    const match = /^([a-z0-9]+):(\d+)$/.exec(key);
    if (!match || !isRecord(data)) {
      return;
    }
    const kind = KIND_BY_PREFIX[match[1]];
    if (!kind) {
      return;
    }
    entries.push({ prefix: match[1], kind, index: Number(match[2]), data });
  });

  const order: ShellyComponentKind[] = ['switch', 'light', 'cover', 'meter', 'input'];
  return entries.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.index - b.index);
};

const getStatusJson = async (host: string): Promise<Record<string, unknown>> => {
  const status = await rpc(host, 'Shelly.GetStatus');
  if (!isRecord(status)) {
    throw new ShellyProtocolError();
  }
  return status;
};

export const detectGen2Components = (status: Record<string, unknown>): ShellyComponent[] =>
  parseStatusEntries(status).map((entry): ShellyComponent => {
    if (entry.kind === 'input') {
      return { kind: entry.kind, index: entry.index };
    }
    const measures =
      entry.kind === 'meter' ||
      asNumber(entry.data.apower) !== undefined ||
      asNumber(entry.data.act_power) !== undefined;
    return { kind: entry.kind, index: entry.index, hasPowerMeter: measures };
  });

const energyWh = (data: Record<string, unknown>): number | undefined =>
  isRecord(data.aenergy) ? asNumber(data.aenergy.total) : undefined;

const mapEntry = (entry: StatusEntry): ShellyComponentStatus => {
  const { kind, index, data } = entry;
  const power = {
    powerW: asNumber(data.apower) ?? asNumber(data.act_power) ?? asNumber(data.total_act_power),
    voltageV: asNumber(data.voltage) ?? asNumber(data.a_voltage),
    currentA: asNumber(data.current) ?? asNumber(data.total_current),
    energyWh: energyWh(data),
  };

  switch (kind) {
    case 'switch':
      return { kind, index, on: asBoolean(data.output), ...power };
    case 'light':
      return {
        kind,
        index,
        on: asBoolean(data.output),
        brightness: asNumber(data.brightness),
        ...power,
      };
    case 'cover':
      return {
        kind,
        index,
        coverState: asString(data.state),
        positionPct: asNumber(data.current_pos),
        ...power,
      };
    case 'meter':
      return { kind, index, ...power };
    case 'input':
      return { kind, index, inputState: asBoolean(data.state) ?? null };
  }
};

export const mapGen2Status = (status: Record<string, unknown>): ShellyComponentStatus[] =>
  parseStatusEntries(status).map(mapEntry);

export const gen2Driver: ShellyDriver = {
  async probe(host: string): Promise<ShellyProbeResult> {
    const info = await shellyRequest<ShellyInfoResponse>({ host, path: '/shelly' });
    const shellyId = asString(info.id);
    const mac = asString(info.mac);
    const model = asString(info.model);
    if (!shellyId || !mac || !model || typeof info.gen !== 'number') {
      throw new ShellyProtocolError();
    }

    const status = await getStatusJson(host);

    return {
      host,
      shellyId,
      mac: mac.toUpperCase(),
      model,
      gen: info.gen,
      firmware: asString(info.ver) ?? asString(info.fw_id),
      name: asString(info.name),
      authRequired: info.auth_en === true,
      components: detectGen2Components(status),
    };
  },

  async getStatus(host: string): Promise<ShellyComponentStatus[]> {
    return mapGen2Status(await getStatusJson(host));
  },

  async setSwitch(host, index, on, autoOffSec): Promise<void> {
    await rpc(host, 'Switch.Set', {
      id: index,
      on,
      ...(autoOffSec !== undefined ? { toggle_after: autoOffSec } : {}),
    });
  },

  async setLight(host, index, on, brightness, autoOffSec): Promise<void> {
    await rpc(host, 'Light.Set', {
      id: index,
      on,
      ...(brightness !== undefined ? { brightness } : {}),
      ...(autoOffSec !== undefined ? { toggle_after: autoOffSec } : {}),
    });
  },

  async setCover(host, index, action: CoverAction | { positionPct: number }): Promise<void> {
    if (typeof action !== 'string') {
      await rpc(host, 'Cover.GoToPosition', { id: index, pos: Math.round(action.positionPct) });
      return;
    }
    const method = { open: 'Cover.Open', close: 'Cover.Close', stop: 'Cover.Stop' }[action];
    await rpc(host, method, { id: index });
  },
};
