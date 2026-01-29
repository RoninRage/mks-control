import { Request, Response, Router } from 'express';
import { TagEvent, TagEventSource } from '../types/auth';

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

export const createAuthRoutes = (broadcast: (event: TagEvent) => void): Router => {
  const router = Router();

  router.post('/tag', (req: Request, res: Response) => {
    const { event, error } = normalizeTagEvent(req);

    if (!event) {
      res.status(400).json({ ok: false, error });
      return;
    }

    broadcast(event);
    res.status(202).json({ ok: true });
  });

  return router;
};
