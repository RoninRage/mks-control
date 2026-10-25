import { Router, Request, Response } from 'express';
import { discoveryTokenMatches, recordFindings } from '../shelly/discovery';

// Reports from the discovery relay (phase 7). Mounted at /api/shelly/discovered before the
// admin-only Shelly routes; authenticated with SHELLY_DISCOVERY_TOKEN. Only POST is handled
// here; GET (admin list) falls through to shellyRoutes.

const router = Router();

/**
 * POST /api/shelly/discovered { devices: [{ host, name }] }
 */
router.post('/', (req: Request, res: Response) => {
  if (!discoveryTokenMatches(req.get('authorization'))) {
    res.status(401).json({ error: 'Ungültiger Schlüssel' });
    return;
  }
  const devices = (req.body as { devices?: unknown }).devices;
  if (!Array.isArray(devices)) {
    res.status(400).json({ error: 'devices fehlt' });
    return;
  }
  const accepted = recordFindings(
    devices.filter(
      (d): d is { host: unknown; name: unknown } => typeof d === 'object' && d !== null
    )
  );
  res.json({ accepted });
});

export default router;
