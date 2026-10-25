import type { NextFunction, Request, Response } from 'express';
import { findMemberById, isAdminTagUid } from '../db/memberLookup';
import type { Member } from '../types/member';
import type { AuthSessionInfo, AuthSessionKind, RoleId } from '../types/auth';
import { readBearer, SESSION_PREFIX } from './keys';
import { highestRole, normalizeRoles } from './roles';
import {
  endSession,
  entranceIdleTimeoutMs,
  findSession,
  touchSession,
  type StoredSession,
} from './sessions';

// Resolves the login session of a request ("Authorization: Bearer mks_…"). Role and member
// always come from the session and the member document, never from client headers.

export interface AuthContext {
  session: StoredSession;
  kind: AuthSessionKind;
  memberId?: string;
  member?: Member;
  roles: RoleId[];
  role: RoleId;
}

const contexts = new WeakMap<Request, AuthContext>();

export const getAuth = (req: Request): AuthContext | undefined => contexts.get(req);
export const currentRole = (req: Request): RoleId | undefined => contexts.get(req)?.role;
export const currentMemberId = (req: Request): string | undefined => contexts.get(req)?.memberId;

export const hasRole = (req: Request, ...roles: RoleId[]): boolean => {
  const role = currentRole(req);
  return role !== undefined && roles.includes(role);
};

/** Builds the context for a session, or null when it no longer grants a login. */
const buildContext = async (session: StoredSession): Promise<AuthContext | null> => {
  if (session.memberId) {
    const member = await findMemberById(session.memberId);
    if (!member || member.isActive === false) {
      return null;
    }
    const roles = normalizeRoles(member.roles);
    return {
      session,
      kind: session.kind,
      memberId: member.id,
      member,
      roles,
      role: highestRole(roles),
    };
  }
  if (session.adminTagUid && isAdminTagUid(session.adminTagUid)) {
    return { session, kind: session.kind, roles: ['admin'], role: 'admin' };
  }
  return null;
};

export const toSessionInfo = (auth: AuthContext, token?: string): AuthSessionInfo => ({
  ...(token ? { token } : {}),
  kind: auth.kind,
  role: auth.role,
  roles: auth.roles,
  ...(auth.member
    ? {
        member: {
          id: auth.member.id,
          firstName: auth.member.firstName,
          lastName: auth.member.lastName,
          roles: auth.member.roles,
          ...(auth.member.preferredTheme ? { preferredTheme: auth.member.preferredTheme } : {}),
        },
      }
    : {}),
  expiresAt: auth.session.expiresAt,
  ...(auth.kind === 'entrance' ? { idleTimeoutMs: entranceIdleTimeoutMs() } : {}),
});

/** Context for a freshly created session (used by the login routes). */
export const contextForSession = buildContext;

/**
 * Reads the session token if present. Requests without one pass on (routes decide with
 * requireAuth); a session token that is no longer valid is answered with 401 right away, so the
 * browser knows to log out. Other bearer keys (terminal, entrance, discovery) are ignored here.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = readBearer(req.get('authorization'));
  if (!token || !token.startsWith(SESSION_PREFIX)) {
    next();
    return;
  }
  try {
    const session = await findSession(token);
    const auth = session ? await buildContext(session) : null;
    if (!session || !auth) {
      if (session) {
        await endSession(session);
      }
      res.status(401).json({ ok: false, error: 'Nicht mehr angemeldet', code: 'session-ended' });
      return;
    }
    contexts.set(req, auth);
    void touchSession(session);
    next();
  } catch (err) {
    console.error('[auth] Session check failed:', err);
    res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!contexts.has(req)) {
    res.status(401).json({ ok: false, error: 'Bitte anmelden', code: 'login-required' });
    return;
  }
  next();
};

/** Only lets requests through whose session has one of the roles. */
export const requireRole =
  (...roles: RoleId[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!contexts.has(req)) {
      res.status(401).json({ ok: false, error: 'Bitte anmelden', code: 'login-required' });
      return;
    }
    if (!hasRole(req, ...roles)) {
      res.status(403).json({ ok: false, error: 'Keine Berechtigung' });
      return;
    }
    next();
  };
