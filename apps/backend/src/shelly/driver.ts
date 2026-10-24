import type { ShellyProbeResult } from '../types/shelly';
import { ShellyProtocolError } from './errors';
import { shellyRequest } from './http';
import { gen1Driver } from './drivers/gen1';
import { gen2Driver } from './drivers/gen2';
import type { ShellyDriver, ShellyInfoResponse } from './drivers/types';

export type { ShellyDriver, CoverAction } from './drivers/types';

// Picks the driver for a device generation. Gen3 and Gen4 use the Gen2 API.
export const getDriver = (gen: number): ShellyDriver => (gen >= 2 ? gen2Driver : gen1Driver);

/**
 * Detects the generation via GET /shelly (no auth needed on any generation) and probes the
 * device with the matching driver.
 */
export const probeShelly = async (host: string): Promise<ShellyProbeResult> => {
  const result = await probeWithMatchingDriver(host);
  return { ...result, mac: normalizeMac(result.mac) };
};

// "a8:03:2a:b1:23:45" and "A8032AB12345" both become "A8032AB12345".
export const normalizeMac = (mac: string): string => mac.replace(/[^0-9a-f]/gi, '').toUpperCase();

const probeWithMatchingDriver = async (host: string): Promise<ShellyProbeResult> => {
  const info = await shellyRequest<ShellyInfoResponse>({ host, path: '/shelly' });
  if (typeof info !== 'object' || info === null || typeof info.mac !== 'string') {
    throw new ShellyProtocolError();
  }
  if (typeof info.gen === 'number' && info.gen >= 2) {
    return gen2Driver.probe(host);
  }
  if (typeof info.type === 'string') {
    return gen1Driver.probe(host);
  }
  throw new ShellyProtocolError();
};
