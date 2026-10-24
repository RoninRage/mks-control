import { createHash, randomBytes } from 'crypto';

// Terminal keys: 32 random bytes, URL-safe, with a prefix so they are easy to recognise.
// Only the SHA-256 hash is stored; the key is shown to the admin once.

const TOKEN_PREFIX = 'mkt_';

export const generateTerminalToken = (): string =>
  `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

export const hashTerminalToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

// Reads "Authorization: Bearer <key>". Returns null when absent or malformed.
export const readBearerToken = (header: string | undefined): string | null => {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !match[1].startsWith(TOKEN_PREFIX)) {
    return null;
  }
  return match[1];
};
