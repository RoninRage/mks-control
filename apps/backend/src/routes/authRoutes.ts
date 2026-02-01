import { Request, Response, Router } from 'express';
import { AuthEvent, TagEvent, TagEventSource } from '../types/auth';
import { getDatabase, getTagDatabase } from '../db/couchdb';
import { Member } from '../types/member';

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

  return {
    event: {
      type: 'tag',
      uid,
      ts,
      source,
      device,
    },
  };
};

export const createAuthRoutes = (broadcast: (event: AuthEvent) => void): Router => {
  const router = Router();

  // Load admin tag UIDs from environment variable
  const adminTagUids = (process.env.ADMIN_TAG_UIDS || '')
    .split(',')
    .map((uid) => uid.trim().toLowerCase())
    .filter((uid) => uid.length > 0);

  console.log(`[auth-routes] Admin tags configured:`, adminTagUids);

  router.post('/tag', async (req: Request, res: Response) => {
    const { event, error } = normalizeTagEvent(req);

    if (!event) {
      res.status(400).json({ ok: false, error });
      return;
    }

    // Check if this is an admin tag (environment variable)
    const isAdminByEnv = adminTagUids.includes(event.uid.toLowerCase());

    // Look up member by tag UID using tags collection
    let member: Member | null = null;
    try {
      const tagDb = getTagDatabase();
      const tagResult = await tagDb.find({
        selector: { tagUid: { $eq: event.uid }, isActive: { $eq: true } },
        limit: 1,
      });

      if (tagResult.docs.length > 0) {
        const tag = tagResult.docs[0];
        const db = getDatabase();
        const memberResult = await db.find({
          selector: { id: { $eq: tag.memberId } },
          limit: 1,
        });

        if (memberResult.docs.length > 0) {
          member = memberResult.docs[0];
          console.log(
            `[auth-routes] Member found via tag: ${member.firstName} ${member.lastName}, roles: ${member.roles.join(', ')}`
          );
        }
      }
    } catch (err) {
      console.error(`[auth-routes] Error looking up member: ${(err as Error).message}`);
    }

    // Determine if admin based on either environment variable or member roles
    const isAdmin = isAdminByEnv || (member?.roles.includes('admin') ?? false);

    // Enrich event with member info and admin status
    const enrichedEvent: AuthEvent = {
      ...event,
      isAdmin,
      memberFound: member !== null,
    } as any;

    // Attach member info (not part of AuthEvent interface but will be sent)
    if (member) {
      (enrichedEvent as any).member = {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        roles: member.roles,
        preferredTheme: member.preferredTheme,
      };
    }

    console.log(
      `[auth-routes] Tag received: ${event.uid}, isAdmin: ${isAdmin}, member: ${member ? `${member.firstName} ${member.lastName}` : 'not found'}`
    );

    broadcast(enrichedEvent);
    res.status(202).json({ ok: true });
  });

  router.post('/heartbeat', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const event: import('../types/auth').HeartbeatEvent = {
      type: 'heartbeat',
      ts: typeof body.ts === 'string' ? body.ts : new Date().toISOString(),
      source: (body.source as import('../types/auth').TagEventSource) || 'manual',
      device: typeof body.device === 'string' ? body.device : 'unknown',
    };
    console.log('[authRoutes] Heartbeat event:', event);
    broadcast(event);
    res.status(202).json({ ok: true });
  });

  return router;
};
