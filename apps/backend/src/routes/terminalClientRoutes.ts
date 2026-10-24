import { Router, Request, Response } from 'express';
import { getAuthenticatedTerminal, requireTerminal } from '../terminals/terminalAuth';
import { endSession, getTerminalState, touchSession } from '../terminals/sessions';

// Endpoints for the Raspberry Pi kiosk. Mounted at /api/terminal.
// Every request is authenticated with the terminal key (Authorization: Bearer mkt_...).

const router = Router();

router.use(requireTerminal);

/**
 * GET /api/terminal/state
 * Machine, logged-in member and whether they may release the machine.
 */
router.get('/state', async (_req: Request, res: Response) => {
  try {
    res.json(await getTerminalState(getAuthenticatedTerminal(res)));
  } catch (err) {
    console.error('[terminal-client] Error reading state:', err);
    res.status(500).json({ error: 'Status konnte nicht geladen werden' });
  }
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
 * POST /api/terminal/logout
 * "Abmelden" button on the Pi.
 */
router.post('/logout', async (_req: Request, res: Response) => {
  const terminal = getAuthenticatedTerminal(res);
  endSession(terminal.id, 'button');
  try {
    res.json(await getTerminalState(terminal));
  } catch (err) {
    console.error('[terminal-client] Error reading state:', err);
    res.status(500).json({ error: 'Status konnte nicht geladen werden' });
  }
});

export default router;
