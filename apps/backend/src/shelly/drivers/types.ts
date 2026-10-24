import type { ShellyComponent, ShellyComponentStatus, ShellyProbeResult } from '../../types/shelly';

export type CoverAction = 'open' | 'close' | 'stop';

// Common interface of the Gen1 and Gen2+ drivers.
export interface ShellyDriver {
  probe(host: string): Promise<ShellyProbeResult>;
  // Pass the stored components to skip detection (saves requests on Gen1).
  getStatus(host: string, components?: ShellyComponent[]): Promise<ShellyComponentStatus[]>;
  // autoOffSec: the device flips the output back by itself after this many seconds.
  setSwitch(host: string, index: number, on: boolean, autoOffSec?: number): Promise<void>;
  setLight(
    host: string,
    index: number,
    on: boolean,
    brightness?: number,
    autoOffSec?: number
  ): Promise<void>;
  setCover(
    host: string,
    index: number,
    action: CoverAction | { positionPct: number }
  ): Promise<void>;
}

// Response of GET /shelly. Gen1 and Gen2+ share the endpoint but not the fields.
export interface ShellyInfoResponse {
  // Gen2+
  id?: string;
  model?: string;
  gen?: number;
  ver?: string;
  fw_id?: string;
  name?: string | null;
  auth_en?: boolean;
  // Gen1
  type?: string;
  auth?: boolean;
  fw?: string;
  // both
  mac?: string;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

export const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
