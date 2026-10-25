import { timingSafeEqual } from 'crypto';
import type { ShellyDiscovery } from '../types/shelly';
import { normalizeShellyHost } from './host';
import { browseShellys } from './mdns';

// Shellys found in the network, kept in memory (phase 7). Findings come from
//   - the discovery relay (separate container on the host network, POST /api/shelly/discovered)
//   - or an in-process mDNS search when the backend itself runs on the host network
//     (SHELLY_DISCOVERY_MDNS=true, e.g. in development).

const EXPIRE_MS = 15 * 60_000;
const MAX_FINDINGS_PER_REPORT = 200;

const findings = new Map<string, ShellyDiscovery>();

export const recordFindings = (devices: Array<{ host: unknown; name: unknown }>): number => {
  let accepted = 0;
  for (const device of devices.slice(0, MAX_FINDINGS_PER_REPORT)) {
    const host = normalizeShellyHost(device.host);
    if (!host) {
      continue;
    }
    const name =
      typeof device.name === 'string' && device.name.trim()
        ? device.name.trim().slice(0, 100)
        : host;
    findings.set(host, { host, name, lastSeenAt: new Date().toISOString() });
    accepted++;
  }
  return accepted;
};

export const listFindings = (excludeHosts: Set<string>): ShellyDiscovery[] => {
  const now = Date.now();
  for (const [host, finding] of findings) {
    if (now - Date.parse(finding.lastSeenAt) > EXPIRE_MS) {
      findings.delete(host);
    }
  }
  return [...findings.values()]
    .filter((f) => !excludeHosts.has(f.host))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
};

// The relay authenticates with SHELLY_DISCOVERY_TOKEN; without it, reports are refused.
export const discoveryTokenMatches = (header: string | undefined): boolean => {
  const expected = process.env.SHELLY_DISCOVERY_TOKEN ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  if (!expected || !match) {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(match[1]);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const discoveryIntervalMs = (): number => {
  const value = Number(process.env.SHELLY_DISCOVERY_INTERVAL_MS);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
};

let timer: ReturnType<typeof setInterval> | null = null;

export const startInProcessDiscovery = (): void => {
  if (process.env.SHELLY_DISCOVERY_MDNS !== 'true' || timer) {
    return;
  }
  const run = (): void => {
    browseShellys()
      .then((found) => recordFindings(found))
      .catch((err) => console.warn('[mdns] Search failed:', err));
  };
  run();
  timer = setInterval(run, discoveryIntervalMs());
  timer.unref();
};
