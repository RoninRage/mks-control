import { randomBytes } from 'crypto';

// One-time login codes. A scan at the entrance sends a code to the kiosk only (WebSocket);
// the kiosk exchanges it for a session (POST /api/auth/session). A code the kiosk does not use
// (it logs out instead, or assigns the tag to a member) simply expires.

export interface PendingLogin {
  memberId?: string;
  adminTagUid?: string;
}

const CODE_TTL_MS = 60_000;
const codes = new Map<string, PendingLogin & { expiresAt: number }>();

const removeExpired = (now: number): void => {
  codes.forEach((entry, code) => {
    if (entry.expiresAt <= now) {
      codes.delete(code);
    }
  });
};

export const createLoginCode = (login: PendingLogin): string => {
  const now = Date.now();
  removeExpired(now);
  const code = randomBytes(24).toString('base64url');
  codes.set(code, { ...login, expiresAt: now + CODE_TTL_MS });
  return code;
};

/** Returns the login for a code and invalidates it, or null when unknown or expired. */
export const consumeLoginCode = (code: string): PendingLogin | null => {
  const entry = codes.get(code);
  codes.delete(code);
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }
  return {
    ...(entry.memberId ? { memberId: entry.memberId } : {}),
    ...(entry.adminTagUid ? { adminTagUid: entry.adminTagUid } : {}),
  };
};
