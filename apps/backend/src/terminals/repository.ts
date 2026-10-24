import { getDatabase } from '../db/couchdb';
import type { Terminal, TerminalSummary } from '../types/terminal';
import { hashTerminalToken } from './token';

export type StoredTerminal = Terminal & { _id: string; _rev: string };

export const toTerminalSummary = (terminal: Terminal): TerminalSummary => {
  const { tokenHash: _tokenHash, ...summary } = terminal;
  return summary;
};

export const listActiveTerminals = async (): Promise<StoredTerminal[]> => {
  const db = getDatabase<Terminal>();
  const result = await db.find({
    selector: { type: { $eq: 'terminal' }, isActive: { $eq: true } },
    limit: 1000,
  });
  return result.docs as StoredTerminal[];
};

export const findTerminalById = async (id: string): Promise<StoredTerminal | null> => {
  const db = getDatabase<Terminal>();
  const result = await db.find({
    selector: { type: { $eq: 'terminal' }, id: { $eq: id }, isActive: { $eq: true } },
    limit: 1,
  });
  return (result.docs[0] as StoredTerminal | undefined) ?? null;
};

export const findTerminalByToken = async (token: string): Promise<StoredTerminal | null> => {
  const db = getDatabase<Terminal>();
  const result = await db.find({
    selector: {
      type: { $eq: 'terminal' },
      tokenHash: { $eq: hashTerminalToken(token) },
      isActive: { $eq: true },
    },
    limit: 1,
  });
  return (result.docs[0] as StoredTerminal | undefined) ?? null;
};

export const saveTerminal = async (terminal: StoredTerminal): Promise<StoredTerminal> => {
  const db = getDatabase<Terminal>();
  const result = await db.insert(terminal);
  return { ...terminal, _rev: result.rev };
};

const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

// Records that the Pi was in contact, at most once a minute to keep writes low.
export const touchTerminal = async (terminal: StoredTerminal): Promise<void> => {
  const now = Date.now();
  const lastSeen = terminal.lastSeenAt ? Date.parse(terminal.lastSeenAt) : 0;
  if (now - lastSeen < LAST_SEEN_WRITE_INTERVAL_MS) {
    return;
  }
  try {
    await saveTerminal({ ...terminal, lastSeenAt: new Date(now).toISOString() });
  } catch (err) {
    // A concurrent write wins; the next request will try again.
    if ((err as { statusCode?: number }).statusCode !== 409) {
      console.error('[terminals] Failed to update lastSeenAt:', err);
    }
  }
};
