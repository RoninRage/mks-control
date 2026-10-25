import { Router, Request, Response } from 'express';
import { findShellyDevice } from '../machines/deviceStatus';
import { checkReleasesForDevice } from '../machines/machineControl';
import { eventKeyMatches } from '../shelly/webhooks';

// Webhook target for Shellys (phase 6). Mounted at /api/shelly/events, before the admin-only
// Shelly routes. Authenticated by the per-device key in the URL, not by user headers.
// Shelly webhooks are plain GET requests; POST is accepted as well.

const router = Router();

const handle = async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await findShellyDevice(req.params.deviceId);
    if (!device || !eventKeyMatches(device, req.query.key)) {
      res.status(403).json({ error: 'Ungültiger Schlüssel' });
      return;
    }
    const checked = await checkReleasesForDevice(device.id);
    res.json({ ok: true, checked });
  } catch (err) {
    console.error('[shelly-events] Handling event failed:', err);
    res.status(500).json({ error: 'Interner Fehler' });
  }
};

router.get('/:deviceId', handle);
router.post('/:deviceId', handle);

export default router;
