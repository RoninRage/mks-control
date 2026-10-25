import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// Keys and tokens of the login (docs/auth-plan.md). All are random, URL-safe and carry a prefix:
//   mks_  session token of a logged-in browser (only its SHA-256 hash is stored)
//   mke_  entrance key: the NFC reader and the kiosk at the entrance (ENTRANCE_KEY)
//   mkt_  machine terminal key (terminals/token.ts)

export const SESSION_PREFIX = 'mks_';
export const ENTRANCE_PREFIX = 'mke_';

export const randomToken = (prefix: string): string =>
  `${prefix}${randomBytes(32).toString('base64url')}`;

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

// Reads "Authorization: Bearer <token>" without checking the prefix.
export const readBearer = (header: string | undefined): string | null => {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
};

const sameSecret = (a: string, b: string): boolean => {
  const left = Buffer.from(sha256(a));
  const right = Buffer.from(sha256(b));
  return timingSafeEqual(left, right);
};

export const getEntranceKey = (): string => (process.env.ENTRANCE_KEY ?? '').trim();

export const isEntranceKey = (value: string | null | undefined): boolean => {
  const key = getEntranceKey();
  return Boolean(key && value && sameSecret(value, key));
};
