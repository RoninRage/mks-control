import { Router, Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import type { Equipment } from '../types/equipment';
import type { Terminal, TerminalTokenResponse } from '../types/terminal';
import {
  findTerminalById,
  listActiveTerminals,
  saveTerminal,
  toTerminalSummary,
  type StoredTerminal,
} from '../terminals/repository';
import { clearTerminalRuntime } from '../terminals/sessions';
import { generateTerminalToken, hashTerminalToken } from '../terminals/token';

// Terminal management for admins. Mounted at /api/terminals.
// One terminal (Raspberry Pi) per machine; each gets a secret key shown once.

const router = Router();

const MAX_NAME_LENGTH = 100;
const MAX_SESSION_MINUTES = 24 * 60;
const MAX_STILL_THERE_MINUTES = 60;

const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.get('x-user-role') !== 'admin') {
    res.status(403).json({ error: 'Nur Admins dürfen Terminals verwalten' });
    return;
  }
  next();
};

router.use(requireAdmin);

interface TerminalInput {
  name?: string;
  equipmentId?: string;
  maxSessionMinutes?: number | null;
  stillThereTimeoutMinutes?: number | null;
}

type ParseResult = { ok: true; value: TerminalInput } | { ok: false; error: string };

// null clears an optional value, undefined leaves it unchanged.
const parseOptionalMinutes = (
  value: unknown,
  max: number,
  label: string
): { ok: true; value: number | null | undefined } | { ok: false; error: string } => {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    return { ok: false, error: `${label} muss eine ganze Zahl zwischen 1 und ${max} sein` };
  }
  return { ok: true, value };
};

const parseInput = (body: unknown, requireAll: boolean): ParseResult => {
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const result: TerminalInput = {};

  if (raw.name !== undefined || requireAll) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `Name muss 1–${MAX_NAME_LENGTH} Zeichen lang sein` };
    }
    result.name = name;
  }

  if (raw.equipmentId !== undefined || requireAll) {
    const equipmentId = typeof raw.equipmentId === 'string' ? raw.equipmentId.trim() : '';
    if (!equipmentId) {
      return { ok: false, error: 'Ausstattung ist erforderlich' };
    }
    result.equipmentId = equipmentId;
  }

  const maxSession = parseOptionalMinutes(
    raw.maxSessionMinutes,
    MAX_SESSION_MINUTES,
    'Höchstdauer'
  );
  if (!maxSession.ok) return maxSession;
  result.maxSessionMinutes = maxSession.value;

  const stillThere = parseOptionalMinutes(
    raw.stillThereTimeoutMinutes,
    MAX_STILL_THERE_MINUTES,
    'Antwortzeit'
  );
  if (!stillThere.ok) return stillThere;
  result.stillThereTimeoutMinutes = stillThere.value;

  return { ok: true, value: result };
};

const equipmentExists = async (id: string): Promise<boolean> => {
  const db = getDatabase<Equipment>();
  const result = await db.find({
    selector: { type: { $eq: 'equipment' }, id: { $eq: id } },
    limit: 1,
  });
  const equipment = result.docs[0];
  return Boolean(equipment) && equipment.isActive !== false;
};

// One Pi per machine: an equipment item may belong to only one active terminal.
const findTerminalForEquipment = async (equipmentId: string): Promise<StoredTerminal | undefined> =>
  (await listActiveTerminals()).find((t) => t.equipmentId === equipmentId);

const applyOptional = (terminal: StoredTerminal | Terminal, input: TerminalInput): void => {
  if (input.maxSessionMinutes !== undefined) {
    terminal.maxSessionMinutes = input.maxSessionMinutes ?? undefined;
  }
  if (input.stillThereTimeoutMinutes !== undefined) {
    terminal.stillThereTimeoutMinutes = input.stillThereTimeoutMinutes ?? undefined;
  }
};

/**
 * GET /api/terminals
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const terminals = (await listActiveTerminals())
      .map(toTerminalSummary)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    res.json(terminals);
  } catch (err) {
    console.error('[terminal-routes] Error listing terminals:', err);
    res.status(500).json({ error: 'Terminals konnten nicht geladen werden' });
  }
});

/**
 * POST /api/terminals { name, equipmentId, maxSessionMinutes?, stillThereTimeoutMinutes? }
 * Returns the new terminal and its key. The key is not stored and cannot be shown again.
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = parseInput(req.body, true);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const input = parsed.value;

  try {
    if (!(await equipmentExists(input.equipmentId!))) {
      res.status(400).json({ error: 'Ausstattung nicht gefunden' });
      return;
    }
    if (await findTerminalForEquipment(input.equipmentId!)) {
      res.status(409).json({ error: 'Für diese Ausstattung gibt es bereits ein Terminal' });
      return;
    }

    const token = generateTerminalToken();
    const now = new Date().toISOString();
    const terminal: Terminal = {
      type: 'terminal',
      id: nanoid(),
      name: input.name!,
      equipmentId: input.equipmentId!,
      tokenHash: hashTerminalToken(token),
      stillThereTimeoutMinutes: 5,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    applyOptional(terminal, input);

    const db = getDatabase<Terminal>();
    const result = await db.insert(terminal);

    void logAuditEvent(
      {
        action: 'terminal.create',
        targetType: 'terminal',
        targetId: terminal.id,
        relatedId: terminal.equipmentId,
      },
      req
    );

    const response: TerminalTokenResponse = {
      terminal: toTerminalSummary({ ...terminal, _id: result.id, _rev: result.rev }),
      token,
    };
    res.status(201).json(response);
  } catch (err) {
    console.error('[terminal-routes] Error creating terminal:', err);
    res.status(500).json({ error: 'Terminal konnte nicht angelegt werden' });
  }
});

/**
 * PUT /api/terminals/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = parseInput(req.body, false);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const input = parsed.value;

  try {
    const terminal = await findTerminalById(req.params.id);
    if (!terminal) {
      res.status(404).json({ error: 'Terminal nicht gefunden' });
      return;
    }

    if (input.equipmentId !== undefined && input.equipmentId !== terminal.equipmentId) {
      if (!(await equipmentExists(input.equipmentId))) {
        res.status(400).json({ error: 'Ausstattung nicht gefunden' });
        return;
      }
      const other = await findTerminalForEquipment(input.equipmentId);
      if (other && other.id !== terminal.id) {
        res.status(409).json({ error: 'Für diese Ausstattung gibt es bereits ein Terminal' });
        return;
      }
      terminal.equipmentId = input.equipmentId;
    }
    if (input.name !== undefined) {
      terminal.name = input.name;
    }
    applyOptional(terminal, input);
    terminal.updatedAt = new Date().toISOString();

    const saved = await saveTerminal(terminal);
    void logAuditEvent(
      { action: 'terminal.update', targetType: 'terminal', targetId: saved.id },
      req
    );
    res.json(toTerminalSummary(saved));
  } catch (err) {
    console.error('[terminal-routes] Error updating terminal:', err);
    res.status(500).json({ error: 'Terminal konnte nicht gespeichert werden' });
  }
});

/**
 * POST /api/terminals/:id/rotate-token
 * Issues a new key; the old one stops working immediately.
 */
router.post('/:id/rotate-token', async (req: Request, res: Response) => {
  try {
    const terminal = await findTerminalById(req.params.id);
    if (!terminal) {
      res.status(404).json({ error: 'Terminal nicht gefunden' });
      return;
    }

    const token = generateTerminalToken();
    const saved = await saveTerminal({
      ...terminal,
      tokenHash: hashTerminalToken(token),
      updatedAt: new Date().toISOString(),
    });
    await clearTerminalRuntime(saved.id);

    void logAuditEvent(
      { action: 'terminal.rotate-token', targetType: 'terminal', targetId: saved.id },
      req
    );
    const response: TerminalTokenResponse = { terminal: toTerminalSummary(saved), token };
    res.json(response);
  } catch (err) {
    console.error('[terminal-routes] Error rotating key:', err);
    res.status(500).json({ error: 'Schlüssel konnte nicht erneuert werden' });
  }
});

/**
 * DELETE /api/terminals/:id
 * Deactivates the terminal; its key stops working and anyone logged in is logged out.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const terminal = await findTerminalById(req.params.id);
    if (!terminal) {
      res.status(404).json({ error: 'Terminal nicht gefunden' });
      return;
    }

    const now = new Date().toISOString();
    await saveTerminal({ ...terminal, isActive: false, deletedAt: now, updatedAt: now });
    await clearTerminalRuntime(terminal.id);

    void logAuditEvent(
      { action: 'terminal.delete', targetType: 'terminal', targetId: terminal.id },
      req
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[terminal-routes] Error deleting terminal:', err);
    res.status(500).json({ error: 'Terminal konnte nicht gelöscht werden' });
  }
});

export default router;
