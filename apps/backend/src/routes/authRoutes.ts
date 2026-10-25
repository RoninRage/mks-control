import { Request, Response, Router } from 'express';
import type {
  AuthEvent,
  HeartbeatEvent,
  ReaderErrorEvent,
  TagEvent,
  TagEventSource,
} from '../types/auth';
import { logAuditEvent } from '../db/audit';
import { findMemberByTagUid, isAdminTagUid } from '../db/memberLookup';
import type { StoredTerminal } from '../terminals/repository';
import { resolveTerminal } from '../terminals/terminalAuth';
import {
  endSession as endTerminalSession,
  hasSession,
  loginFromMember,
  reportRejectedScan,
  startSession,
} from '../terminals/sessions';
import { ENTRANCE_PREFIX, isEntranceKey, readBearer } from '../auth/keys';
import { consumeLoginCode, createLoginCode, type PendingLogin } from '../auth/loginCodes';
import { contextForSession, getAuth, requireAuth, toSessionInfo } from '../auth/middleware';
import { createSession, endSession, type NewSession } from '../auth/sessions';
import { recordWebnfcFailure, webnfcAllowed } from '../auth/rateLimit';

// Login (docs/auth-plan.md):
//   POST /tag       scan from a reader; needs the entrance key or a machine terminal key
//   POST /session   kiosk exchanges the one-time code from the scan for a session
//   POST /webnfc    phone sends the UID it read and gets a session directly
//   GET  /me        current session
//   POST /logout    ends the current session
//   POST /ping      activity at the kiosk (keeps the session from timing out)

const allowedSources: TagEventSource[] = ['acr122u', 'webnfc', 'manual'];

interface NormalizationResult {
  event?: TagEvent;
  error?: string;
}

const normalizeTagEvent = (req: Request): NormalizationResult => {
  const body = (req.body ?? {}) as Partial<TagEvent>;

  if (body.type !== 'tag') {
    return { error: 'type must be "tag"' };
  }

  const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
  if (!uid) {
    return { error: 'uid is required' };
  }

  const rawTs = typeof body.ts === 'string' ? body.ts : undefined;
  if (rawTs && Number.isNaN(Date.parse(rawTs))) {
    return { error: 'ts must be ISO8601' };
  }
  const ts = rawTs ? new Date(rawTs).toISOString() : new Date().toISOString();

  if (body.source && !allowedSources.includes(body.source)) {
    return { error: 'source must be acr122u, webnfc, or manual' };
  }
  const source = body.source ?? 'acr122u';

  const headerDevice = req.get('x-device-id');
  const bodyDevice = typeof body.device === 'string' ? body.device.trim() : '';
  const device = bodyDevice || headerDevice?.trim() || 'unknown';

  return { event: { type: 'tag', uid, ts, source, device } };
};

const isTestTagInProduction = (uid: string): boolean =>
  process.env.NODE_ENV === 'production' && /^test-/.test(uid);

/** True when the request carries the entrance key. */
const fromEntrance = (req: Request): boolean => {
  const token = readBearer(req.get('authorization'));
  return Boolean(token && token.startsWith(ENTRANCE_PREFIX) && isEntranceKey(token));
};

/**
 * A scan at a machine terminal (request carries the terminal key). It only changes the login
 * at that terminal and is not sent to any browser, so other browsers do not react to it.
 * Scanning while someone is logged in logs them out, like at the entrance terminal.
 */
const handleTerminalScan = async (
  terminal: StoredTerminal,
  event: TagEvent,
  req: Request
): Promise<void> => {
  if (hasSession(terminal.id)) {
    // Logging out also ends a machine release (switches the machine off).
    await endTerminalSession(terminal.id, 'scan');
    return;
  }

  const { member, isInactive } = await findMemberByTagUid(event.uid);
  const isAdminTag = isAdminTagUid(event.uid);

  if (member && isInactive) {
    reportRejectedScan(terminal.id, 'inactive-member');
    void logAuditEvent(
      {
        action: 'terminal.login.inactive',
        actorId: member.id,
        targetType: 'terminal',
        targetId: terminal.id,
        source: 'terminal',
      },
      req
    );
    return;
  }

  if (!member && !isAdminTag) {
    reportRejectedScan(terminal.id, 'unknown-tag');
    void logAuditEvent(
      {
        action: 'terminal.login.invalid',
        targetType: 'terminal',
        targetId: terminal.id,
        relatedId: event.uid,
        source: 'terminal',
      },
      req
    );
    return;
  }

  startSession(terminal, loginFromMember(member, isAdminTag));
  void logAuditEvent(
    {
      action: 'terminal.login',
      actorId: member?.id,
      targetType: 'terminal',
      targetId: terminal.id,
      relatedId: terminal.equipmentId,
      source: 'terminal',
    },
    req
  );
};

/** A scan at the entrance: sent to the kiosk only, with a one-time login code. */
const handleEntranceScan = async (
  event: TagEvent,
  req: Request,
  broadcast: (event: AuthEvent) => void
): Promise<void> => {
  const isAdminByEnv = isAdminTagUid(event.uid);
  let lookup: Awaited<ReturnType<typeof findMemberByTagUid>> = { member: null, isInactive: false };
  try {
    lookup = await findMemberByTagUid(event.uid);
  } catch (err) {
    console.error(`[auth-routes] Error looking up member: ${(err as Error).message}`);
  }
  const { member, isInactive } = lookup;

  if (member && isInactive) {
    void logAuditEvent(
      {
        action: 'auth.login.inactive',
        actorId: member.id,
        targetType: 'member',
        targetId: member.id,
      },
      req
    );
  } else if (member) {
    void logAuditEvent(
      { action: 'auth.login', actorId: member.id, targetType: 'member', targetId: member.id },
      req
    );
  } else if (isAdminByEnv) {
    void logAuditEvent(
      { action: 'auth.login.admin-tag', targetType: 'tag', targetId: event.uid },
      req
    );
  } else {
    void logAuditEvent(
      { action: 'auth.login.invalid', targetType: 'tag', targetId: event.uid },
      req
    );
  }

  const isAdmin = isAdminByEnv || (member?.roles.includes('admin') ?? false);
  const canLogin = (member !== null && !isInactive) || (member === null && isAdminByEnv);
  const login: PendingLogin | null = canLogin
    ? member
      ? { memberId: member.id }
      : { adminTagUid: event.uid }
    : null;

  const enriched: TagEvent = {
    ...event,
    isAdmin,
    memberFound: member !== null && !isInactive,
    isInactive: isInactive && member !== null,
    ...(member
      ? {
          member: {
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            roles: member.roles,
            ...(member.preferredTheme ? { preferredTheme: member.preferredTheme } : {}),
          },
        }
      : {}),
    ...(login ? { loginCode: createLoginCode(login) } : {}),
  };
  broadcast(enriched);
};

const startSessionResponse = async (res: Response, input: NewSession): Promise<void> => {
  const { token, session } = await createSession(input);
  const auth = await contextForSession(session);
  if (!auth) {
    await endSession(session);
    res.status(403).json({ ok: false, error: 'Anmeldung nicht möglich' });
    return;
  }
  res.status(201).json({ ok: true, data: toSessionInfo(auth, token) });
};

export const createAuthRoutes = (broadcast: (event: AuthEvent) => void): Router => {
  const router = Router();

  router.post('/tag', async (req: Request, res: Response) => {
    const { event, error } = normalizeTagEvent(req);

    if (!event) {
      res.status(400).json({ ok: false, error });
      return;
    }

    if (isTestTagInProduction(event.uid)) {
      res
        .status(403)
        .json({ ok: false, error: 'Test tags are not allowed in production environment' });
      return;
    }

    try {
      if (fromEntrance(req)) {
        await handleEntranceScan(event, req, broadcast);
        res.status(202).json({ ok: true });
        return;
      }

      // Scans from a machine terminal carry its key and are handled separately.
      const terminal = await resolveTerminal(req);
      if (terminal && terminal !== 'invalid') {
        await handleTerminalScan(terminal, event, req);
        res.status(202).json({ ok: true });
        return;
      }
    } catch (err) {
      console.error(`[auth-routes] Scan failed: ${(err as Error).message}`);
      res.status(500).json({ ok: false, error: 'Scan failed' });
      return;
    }

    res.status(401).json({ ok: false, error: 'Ungültiger oder fehlender Leser-Schlüssel' });
  });

  router.post('/session', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { code?: unknown };
    const login = typeof body.code === 'string' ? consumeLoginCode(body.code) : null;
    if (!login) {
      res.status(401).json({ ok: false, error: 'Anmeldung abgelaufen, bitte erneut scannen' });
      return;
    }
    try {
      await startSessionResponse(res, { kind: 'entrance', ...login });
    } catch (err) {
      console.error('[auth-routes] Creating session failed:', err);
      res.status(500).json({ ok: false, error: 'Interner Fehler' });
    }
  });

  router.post('/webnfc', async (req: Request, res: Response) => {
    if (process.env.WEBNFC_LOGIN === 'false') {
      res.status(403).json({ ok: false, error: 'Anmeldung per Handy ist abgeschaltet' });
      return;
    }
    if (!webnfcAllowed()) {
      res.status(429).json({ ok: false, error: 'Zu viele Versuche, bitte kurz warten' });
      return;
    }
    const body = (req.body ?? {}) as { uid?: unknown };
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!uid) {
      res.status(400).json({ ok: false, error: 'uid is required' });
      return;
    }
    if (isTestTagInProduction(uid)) {
      res
        .status(403)
        .json({ ok: false, error: 'Test tags are not allowed in production environment' });
      return;
    }
    // Emergency admin tags only work at the entrance reader.
    if (isAdminTagUid(uid)) {
      recordWebnfcFailure();
      void logAuditEvent(
        {
          action: 'auth.login.webnfc.admin-tag',
          targetType: 'tag',
          targetId: uid,
          source: 'webnfc',
        },
        req
      );
      res.status(403).json({ ok: false, error: 'Dieser Tag funktioniert nur am Eingang' });
      return;
    }

    try {
      const { member, isInactive } = await findMemberByTagUid(uid);
      if (!member) {
        recordWebnfcFailure();
        void logAuditEvent(
          { action: 'auth.login.invalid', targetType: 'tag', targetId: uid, source: 'webnfc' },
          req
        );
        res.status(401).json({ ok: false, error: 'Unbekannter Tag', code: 'unknown-tag' });
        return;
      }
      if (isInactive) {
        void logAuditEvent(
          {
            action: 'auth.login.inactive',
            actorId: member.id,
            targetType: 'member',
            targetId: member.id,
            source: 'webnfc',
          },
          req
        );
        res.status(403).json({ ok: false, error: 'Mitglied ist inaktiv', code: 'inactive' });
        return;
      }
      void logAuditEvent(
        {
          action: 'auth.login',
          actorId: member.id,
          targetType: 'member',
          targetId: member.id,
          source: 'webnfc',
        },
        req
      );
      await startSessionResponse(res, { kind: 'webnfc', memberId: member.id });
    } catch (err) {
      console.error('[auth-routes] Web NFC login failed:', err);
      res.status(500).json({ ok: false, error: 'Interner Fehler' });
    }
  });

  router.get('/me', requireAuth, (req: Request, res: Response) => {
    const auth = getAuth(req);
    if (!auth) {
      res.status(401).json({ ok: false, error: 'Bitte anmelden' });
      return;
    }
    res.json({ ok: true, data: toSessionInfo(auth) });
  });

  router.post('/ping', requireAuth, (_req: Request, res: Response) => {
    res.status(204).end();
  });

  router.post('/logout', async (req: Request, res: Response) => {
    const auth = getAuth(req);
    if (!auth) {
      // Already logged out (e.g. the session timed out): nothing to do.
      res.status(202).json({ ok: true });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    await endSession(auth.session);
    await logAuditEvent(
      {
        action: reason ? `auth.logout.${reason}` : 'auth.logout',
        actorId: auth.memberId,
        actorRole: auth.role,
        targetType: 'member',
        targetId: auth.memberId,
      },
      req
    );
    res.status(202).json({ ok: true });
  });

  // Reader status from the entrance bridge; only the kiosk gets it.
  router.post('/heartbeat', (req: Request, res: Response) => {
    if (!fromEntrance(req)) {
      res.status(202).json({ ok: true });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const event: HeartbeatEvent = {
      type: 'heartbeat',
      ts: typeof body.ts === 'string' ? body.ts : new Date().toISOString(),
      source: (body.source as TagEventSource) || 'manual',
      device: typeof body.device === 'string' ? body.device : 'unknown',
    };
    broadcast(event);
    res.status(202).json({ ok: true });
  });

  router.post('/reader-error', (req: Request, res: Response) => {
    if (!fromEntrance(req)) {
      res.status(202).json({ ok: true });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const event: ReaderErrorEvent = {
      type: 'reader-error',
      ts: typeof body.ts === 'string' ? body.ts : new Date().toISOString(),
      source: (body.source as TagEventSource) || 'acr122u',
      device: typeof body.device === 'string' ? body.device : 'unknown',
      error: typeof body.error === 'string' ? body.error : 'Unknown reader error',
    };
    broadcast(event);
    res.status(202).json({ ok: true });
  });

  return router;
};
