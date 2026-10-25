import makeMdns from 'multicast-dns';

// Finds Shellys in the local network via mDNS (docs/shelly-plan.md, phase 7).
// Gen2+ devices announce "_shelly._tcp", Gen1 devices "_http._tcp"; instances are named
// after the device ("shellyplus1pm-…", "shelly1pm-…"). Multicast only works on the host
// network, not inside a Docker bridge network; see discoveryRelay.ts.

export interface MdnsFinding {
  host: string; // ip or ip:port
  name: string;
}

const SERVICES = ['_shelly._tcp.local', '_http._tcp.local'];

interface MdnsRecord {
  name: string;
  type: string;
  data: unknown;
}

const isShellyName = (name: string): boolean => /^shelly/i.test(name);

const instanceLabel = (instance: string): string => instance.split('._')[0] ?? instance;

export const browseShellys = (durationMs = 3000): Promise<MdnsFinding[]> =>
  new Promise((resolve) => {
    const mdns = makeMdns();
    const instances = new Set<string>();
    const srv = new Map<string, { target: string; port: number }>();
    const addresses = new Map<string, string>();

    mdns.on('response', (response: { answers?: MdnsRecord[]; additionals?: MdnsRecord[] }) => {
      const records = [...(response.answers ?? []), ...(response.additionals ?? [])];
      for (const record of records) {
        if (
          record.type === 'PTR' &&
          SERVICES.includes(record.name) &&
          typeof record.data === 'string'
        ) {
          instances.add(record.data);
        } else if (record.type === 'SRV' && typeof record.data === 'object' && record.data) {
          const data = record.data as { target?: string; port?: number };
          if (data.target) {
            srv.set(record.name, { target: data.target, port: data.port ?? 80 });
          }
        } else if (record.type === 'A' && typeof record.data === 'string') {
          addresses.set(record.name, record.data);
        }
      }
    });
    mdns.on('error', (err: Error) => {
      console.warn(`[mdns] ${err.message}`);
    });

    mdns.query({ questions: SERVICES.map((name) => ({ name, type: 'PTR' as const })) });

    setTimeout(() => {
      mdns.destroy();
      const findings = new Map<string, MdnsFinding>();
      for (const instance of instances) {
        const label = instanceLabel(instance);
        const service = srv.get(instance);
        if (!service || !isShellyName(label)) {
          continue;
        }
        const ip = addresses.get(service.target);
        if (!ip) {
          continue;
        }
        const host = service.port === 80 ? ip : `${ip}:${service.port}`;
        findings.set(host, { host, name: label });
      }
      resolve([...findings.values()]);
    }, durationMs);
  });
