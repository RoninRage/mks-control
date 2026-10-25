import { getDatabase } from '../db/couchdb';
import type { AuthSessionKind } from '../types/auth';
import { randomToken, sha256, SESSION_PREFIX } from './keys';

// Login sessions of browsers (docs/auth-plan.md). Stored in the members database as
// "session:<sha256 of the token>", so a lookup is a single GET and a backend restart
// (e.g. an update via Watchtower) does not log anyone out. The token itself is never stored.

export interface StoredSession {
  _id: string;
  _rev?: string;
  type: 'session';
  kind: AuthSessionKind;
  memberId?: string;
  // Set for admin tags from ADMIN_TAG_UIDS without a member; checked again on every request.
  adminTagUid?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

const fromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// Entrance kiosk: logged out after this long without activity (default 5 minutes).
export const entranceIdleTimeoutMs = (): number => fromEnv('SESSION_IDLE_TIMEOUT_MS', 300_000);
// Longest possible session at the kiosk and on a phone.
const entranceMaxMs = (): number => fromEnv('SESSION_ENTRANCE_MAX_MS', 12 * 3_600_000);
const webnfcMaxMs = (): number => fromEnv('SESSION_WEBNFC_MAX_MS', 8 * 3_600_000);

const sessionDocId = (token: string): string => `session:${sha256(token)}`;

const isExpired = (session: StoredSession, now: number): boolean => {
  if (Date.parse(session.expiresAt) <= now) {
    return true;
  }
  return (
    session.kind === 'entrance' && now - Date.parse(session.lastSeenAt) > entranceIdleTimeoutMs()
  );
};

export interface NewSession {
  kind: AuthSessionKind;
  memberId?: string;
  adminTagUid?: string;
}

export const createSession = async (
  input: NewSession
): Promise<{ token: string; session: StoredSession }> => {
  const token = randomToken(SESSION_PREFIX);
  const now = Date.now();
  const maxMs = input.kind === 'entrance' ? entranceMaxMs() : webnfcMaxMs();
  const session: StoredSession = {
    _id: sessionDocId(token),
    type: 'session',
    kind: input.kind,
    ...(input.memberId ? { memberId: input.memberId } : {}),
    ...(input.adminTagUid ? { adminTagUid: input.adminTagUid } : {}),
    createdAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(now + maxMs).toISOString(),
  };
  const result = await getDatabase<StoredSession>().insert(session);
  return { token, session: { ...session, _rev: result.rev } };
};

const deleteSession = async (session: StoredSession): Promise<void> => {
  if (!session._rev) {
    return;
  }
  try {
    await getDatabase<StoredSession>().destroy(session._id, session._rev);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404 && status !== 409) {
      console.error('[auth] Failed to delete session:', err);
    }
  }
};

/** Returns the valid session for a token, or null. Expired sessions are deleted. */
export const findSession = async (token: string): Promise<StoredSession | null> => {
  let session: StoredSession;
  try {
    session = await getDatabase<StoredSession>().get(sessionDocId(token));
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      return null;
    }
    throw err;
  }
  if (session.type !== 'session') {
    return null;
  }
  if (isExpired(session, Date.now())) {
    await deleteSession(session);
    return null;
  }
  return session;
};

// lastSeenAt is written at most this often; short enough for the idle limit to be exact
// to a fifth of its length.
const touchIntervalMs = (): number => Math.min(60_000, Math.floor(entranceIdleTimeoutMs() / 5));

/** Records activity (keeps an entrance session from timing out). */
export const touchSession = async (session: StoredSession): Promise<void> => {
  const now = Date.now();
  if (now - Date.parse(session.lastSeenAt) < touchIntervalMs()) {
    return;
  }
  try {
    const result = await getDatabase<StoredSession>().insert({
      ...session,
      lastSeenAt: new Date(now).toISOString(),
    });
    session._rev = result.rev;
    session.lastSeenAt = new Date(now).toISOString();
  } catch (err) {
    // A concurrent request already wrote it.
    if ((err as { statusCode?: number }).statusCode !== 409) {
      console.error('[auth] Failed to update session:', err);
    }
  }
};

export const endSession = async (session: StoredSession): Promise<void> => {
  await deleteSession(session);
};

/** Ends all sessions of a member, e.g. when they are deactivated. */
export const endSessionsOfMember = async (memberId: string): Promise<void> => {
  const result = await getDatabase<StoredSession>().find({
    selector: { type: { $eq: 'session' }, memberId: { $eq: memberId } },
    limit: 1000,
  });
  await Promise.all(result.docs.map((session) => deleteSession(session)));
};

const sweepExpiredSessions = async (): Promise<void> => {
  try {
    const result = await getDatabase<StoredSession>().find({
      selector: { type: { $eq: 'session' } },
      limit: 10_000,
    });
    const now = Date.now();
    await Promise.all(
      result.docs.filter((s) => isExpired(s, now)).map((session) => deleteSession(session))
    );
  } catch (err) {
    console.error('[auth] Session sweep failed:', err);
  }
};

let sweeper: ReturnType<typeof setInterval> | null = null;

export const startAuthSessionSweeper = (): void => {
  if (sweeper) {
    return;
  }
  const interval = Math.min(600_000, Math.max(1000, Math.floor(entranceIdleTimeoutMs() / 2)));
  sweeper = setInterval(() => {
    void sweepExpiredSessions();
  }, interval);
};
