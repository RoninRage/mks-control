import { browseShellys } from './mdns';

// Discovery relay (phase 7): runs on the host network next to the backend and reports Shellys
// it finds via mDNS. Started from the backend image with a different command, e.g. in
// docker-compose.prod.yml:
//
//   shelly-discovery:
//     image: ghcr.io/<owner>/mks-control-backend
//     network_mode: host
//     command: ["npx", "ts-node", "--transpile-only", "src/shelly/discoveryRelay.ts"]
//     environment:
//       BACKEND_URL: http://127.0.0.1:3000
//       SHELLY_DISCOVERY_TOKEN: <same as the backend>

const backendUrl = (process.env.BACKEND_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const token = process.env.SHELLY_DISCOVERY_TOKEN ?? '';
const intervalValue = Number(process.env.SHELLY_DISCOVERY_INTERVAL_MS);
const intervalMs = Number.isFinite(intervalValue) && intervalValue > 0 ? intervalValue : 60_000;

const report = async (): Promise<void> => {
  const devices = await browseShellys();
  if (devices.length === 0) {
    return;
  }
  try {
    const response = await fetch(`${backendUrl}/api/shelly/discovered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ devices }),
    });
    if (!response.ok) {
      console.warn(`[discovery] Backend answered ${response.status}`);
    } else {
      console.log(`[discovery] Reported ${devices.length} Shelly(s)`);
    }
  } catch (err) {
    console.warn(`[discovery] Backend not reachable: ${(err as Error).message}`);
  }
};

if (!token) {
  console.error('[discovery] SHELLY_DISCOVERY_TOKEN is required');
  process.exit(1);
}

console.log(`[discovery] Searching every ${intervalMs / 1000} s, reporting to ${backendUrl}`);
void report();
setInterval(() => {
  void report();
}, intervalMs);
