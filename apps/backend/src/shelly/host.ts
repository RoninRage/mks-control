// Validation of Shelly host addresses entered by admins.
//
// The backend sends HTTP requests to whatever host an admin enters. To keep this from being
// used to reach arbitrary servers, only IPv4 addresses in local ranges are accepted
// (private, loopback, link-local), optionally with a port. Shellys should get fixed IPs
// via DHCP reservation anyway.

const IPV4_WITH_PORT = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/;

const isLocalIpv4 = (octets: number[]): boolean => {
  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  return false;
};

/**
 * Returns the normalized host ("192.168.1.20" or "192.168.1.20:8080"),
 * or null when the input is not an allowed address.
 */
export const normalizeShellyHost = (input: unknown): string | null => {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const match = IPV4_WITH_PORT.exec(trimmed);
  if (!match) {
    return null;
  }

  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return null;
  }
  if (!isLocalIpv4(octets)) {
    return null;
  }

  const ip = octets.join('.');
  if (match[5] === undefined) {
    return ip;
  }

  const port = Number(match[5]);
  if (port < 1 || port > 65535) {
    return null;
  }
  return port === 80 ? ip : `${ip}:${port}`;
};
