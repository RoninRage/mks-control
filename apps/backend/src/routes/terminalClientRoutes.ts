import { Router, Request, Response } from 'express';
import { getAuthenticatedTerminal, requireTerminal } from '../terminals/terminalAuth';
import { endSession, touchSession } from '../terminals/sessions';
import { getTerminalState } from '../terminals/state';
import { confirmStillThere, MachineError, releaseMachine } from '../machines/machineControl';

// Endpoints for the Raspberry Pi kiosk. Mounted at /api/terminal.
// Every request is authenticated with the terminal key (Authorization: Bearer mkt_...).

const router = Router();

router.use(requireTerminal);

const sendState = async (res: Response): Promise<void> => {
  try {
    res.json(await getTerminalState(getAuthenticatedTerminal(res)));
  } catch (err) {
    console.error('[terminal-client] Error reading state:', err);
    res.status(500).json({ error: 'Status konnte nicht geladen werden' });
  }
};

/**
 * GET /api/terminal/state
 * Machine, logged-in member, permission and release. Polling it also tells the backend
 * that the Pi is online.
 */
router.get('/state', async (_req: Request, res: Response) => {
  await sendState(res);
});

/**
 * POST /api/terminal/activity
 * The member is still using the Pi (any touch); pushes the auto-logout back.
 */
router.post('/activity', (_req: Request, res: Response) => {
  touchSession(getAuthenticatedTerminal(res).id);
  res.json({ ok: true });
});

/**
 * POST /api/terminal/release
 * "Maschine freigeben": switches the machine on.
 */
router.post('/release', async (_req: Request, res: Response) => {
  try {
    await releaseMachine(getAuthenticatedTerminal(res));
  } catch (err) {
    if (err instanceof MachineError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error('[terminal-client] Release failed:', err);
    res.status(500).json({ error: 'Freigabe fehlgeschlagen' });
    return;
  }
  await sendState(res);
});

/**
 * POST /api/terminal/still-there
 * "Ja, noch da": the release continues for another period.
 */
router.post('/still-there', async (_req: Request, res: Response) => {
  if (!confirmStillThere(getAuthenticatedTerminal(res).id)) {
    res.status(409).json({ error: 'Keine laufende Freigabe' });
    return;
  }
  await sendState(res);
});

/**
 * POST /api/terminal/logout
 * "Abmelden" button on the Pi. Ends a release and switches the machine off.
 */
router.post('/logout', async (_req: Request, res: Response) => {
  await endSession(getAuthenticatedTerminal(res).id, 'button');
  await sendState(res);
});

export default router;
