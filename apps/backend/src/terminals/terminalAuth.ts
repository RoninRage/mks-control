import type { NextFunction, Request, Response } from 'express';
import { findTerminalByToken, touchTerminal, type StoredTerminal } from './repository';
import { readBearerToken } from './token';

// Authenticates a Raspberry Pi terminal by its key ("Authorization: Bearer mkt_...").
// The terminal is resolved from the key alone; client headers like X-Device-ID do not count.

export const getAuthenticatedTerminal = (res: Response): StoredTerminal => {
  const terminal = res.locals.terminal as StoredTerminal | undefined;
  if (!terminal) {
    throw new Error('requireTerminal middleware missing');
  }
  return terminal;
};

/**
 * Resolves the terminal for a request. Returns:
 *   - null when the request carries no terminal key
 *   - 'invalid' when it carries a key that matches no active terminal
 */
export const resolveTerminal = async (req: Request): Promise<StoredTerminal | 'invalid' | null> => {
  const header = req.get('authorization');
  if (!header) {
    return null;
  }
  const token = readBearerToken(header);
  if (!token) {
    return 'invalid';
  }
  const terminal = await findTerminalByToken(token);
  if (!terminal) {
    return 'invalid';
  }
  void touchTerminal(terminal);
  return terminal;
};

export const requireTerminal = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const terminal = await resolveTerminal(req);
    if (!terminal || terminal === 'invalid') {
      res.status(401).json({ error: 'Ungültiger oder fehlender Terminal-Schlüssel' });
      return;
    }
    res.locals.terminal = terminal;
    next();
  } catch (err) {
    console.error('[terminals] Auth error:', err);
    res.status(500).json({ error: 'Interner Fehler' });
  }
};
