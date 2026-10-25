import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import { findMemberById } from '../db/memberLookup';
import type { Equipment } from '../types/equipment';
import type { Member } from '../types/member';
import type {
  TerminalDenyReason,
  TerminalLastScan,
  TerminalScanResult,
  TerminalSessionInfo,
} from '../types/terminal';
import type { StoredTerminal } from './repository';

// Who is logged in at which terminal. Kept in memory; machine releases are persisted
// separately (machines/machineControl.ts) and restore their login after a restart.

interface StoredSession {
  // Null for an admin tag from ADMIN_TAG_UIDS that belongs to no member.
  memberId: string | null;
  firstName: string;
  lastName: string;
  // Admin via ADMIN_TAG_UIDS; member roles are re-read on every state request.
  isAdminTag: boolean;
  startedAt: number;
  lastActivityAt: number;
}

const sessions = new Map<string, StoredSession>();
const lastScans = new Map<string, TerminalLastScan>();

let notifyTerminal: (terminalId: string) => void = () => undefined;

// Called whenever a terminal's state changes (server.ts wires this to the WebSocket).
export const setTerminalNotifier = (notify: (terminalId: string) => void): void => {
  notifyTerminal = notify;
};

export const notifyTerminalChanged = (terminalId: string): void => {
  notifyTerminal(terminalId);
};

export type LogoutReason = 'scan' | 'button' | 'timeout' | 'terminal-removed' | 'terminal-offline';

// Runs before a session ends; machine control uses it to switch the machine off.
let sessionEndHandler: (terminalId: string, reason: LogoutReason) => Promise<void> = async () =>
  undefined;

export const setSessionEndHandler = (
  handler: (terminalId: string, reason: LogoutReason) => Promise<void>
): void => {
  sessionEndHandler = handler;
};

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;

// Logged in without activity for this long → logged out. Configurable for tests.
export const getIdleTimeoutMs = (): number => {
  const fromEnv = Number(process.env.TERMINAL_IDLE_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_IDLE_TIMEOUT_MS;
};

export const recordScan = (terminalId: string, result: TerminalScanResult): void => {
  lastScans.set(terminalId, { result, at: new Date().toISOString() });
};

export const getLastScan = (terminalId: string): TerminalLastScan | undefined =>
  lastScans.get(terminalId);

// Records a scan that did not log anyone in (unknown tag, deactivated member) and tells the Pi.
export const reportRejectedScan = (terminalId: string, result: TerminalScanResult): void => {
  recordScan(terminalId, result);
  notifyTerminal(terminalId);
};

export const hasSession = (terminalId: string): boolean => sessions.has(terminalId);

// Name of the person logged in at a terminal (admin overview).
export const getSessionName = (terminalId: string): string | null => {
  const session = sessions.get(terminalId);
  return session ? `${session.firstName} ${session.lastName}`.trim() : null;
};

export interface SessionLogin {
  memberId: string | null;
  firstName: string;
  lastName: string;
  isAdminTag: boolean;
}

export const loginFromMember = (member: Member | null, isAdminTag: boolean): SessionLogin => ({
  memberId: member?.id ?? null,
  firstName: member?.firstName ?? 'Admin',
  lastName: member?.lastName ?? '',
  isAdminTag,
});

export const startSession = (
  terminal: StoredTerminal,
  login: SessionLogin,
  options: { silent?: boolean } = {}
): void => {
  const now = Date.now();
  sessions.set(terminal.id, { ...login, startedAt: now, lastActivityAt: now });
  if (!options.silent) {
    recordScan(terminal.id, 'login');
    notifyTerminal(terminal.id);
  }
};

export const endSession = async (terminalId: string, reason: LogoutReason): Promise<boolean> => {
  const session = sessions.get(terminalId);
  if (!session) {
    return false;
  }

  try {
    await sessionEndHandler(terminalId, reason);
  } catch (err) {
    console.error('[terminals] Session end handler failed:', err);
  }

  // The handler may have ended the session already (e.g. via a nested call).
  if (sessions.get(terminalId) !== session) {
    return true;
  }
  sessions.delete(terminalId);
  if (reason === 'scan' || reason === 'button') {
    recordScan(terminalId, 'logout');
  }

  void logAuditEvent({
    action: `terminal.logout.${reason}`,
    actorId: session.memberId ?? undefined,
    targetType: 'terminal',
    targetId: terminalId,
    source: 'terminal',
  });
  notifyTerminal(terminalId);
  return true;
};

export const touchSession = (terminalId: string): void => {
  const session = sessions.get(terminalId);
  if (session) {
    session.lastActivityAt = Date.now();
  }
};

export const sweepExpiredSessions = (): void => {
  const timeout = getIdleTimeoutMs();
  const now = Date.now();
  [...sessions.entries()].forEach(([terminalId, session]) => {
    if (now - session.lastActivityAt >= timeout) {
      void endSession(terminalId, 'timeout');
    }
  });
};

let sweeper: ReturnType<typeof setInterval> | null = null;

export const startSessionSweeper = (): void => {
  if (sweeper) {
    return;
  }
  const interval = Math.min(15_000, Math.max(500, Math.floor(getIdleTimeoutMs() / 4)));
  sweeper = setInterval(sweepExpiredSessions, interval);
  sweeper.unref();
};

export const findEquipment = async (id: string): Promise<Equipment | null> => {
  const db = getDatabase<Equipment>();
  const result = await db.find({
    selector: { type: { $eq: 'equipment' }, id: { $eq: id } },
    limit: 1,
  });
  const equipment = result.docs[0];
  if (!equipment || equipment.isActive === false) {
    return null;
  }
  return equipment;
};

interface ReleaseDecision {
  canRelease: boolean;
  adminOverride: boolean;
  isAdmin: boolean;
  denyReason?: TerminalDenyReason;
}

/**
 * Decides whether the logged-in person may release the machine.
 * Rules (docs/shelly-plan.md): an active member with a permission for this equipment, or
 * any admin (admin override). A machine marked unavailable cannot be released by anyone.
 */
export const decideRelease = (
  session: Pick<StoredSession, 'isAdminTag'>,
  member: Member | null,
  equipment: Equipment | null
): ReleaseDecision => {
  const memberActive = member !== null && member.isActive !== false;
  const isAdmin = session.isAdminTag || (memberActive && member.roles.includes('admin'));
  const hasPermission =
    memberActive && equipment !== null && member.equipmentPermissions?.[equipment.id] === true;

  if (!equipment || !equipment.isAvailable) {
    return {
      canRelease: false,
      adminOverride: false,
      isAdmin,
      denyReason: 'equipment-unavailable',
    };
  }
  if (hasPermission) {
    return { canRelease: true, adminOverride: false, isAdmin };
  }
  if (isAdmin) {
    return { canRelease: true, adminOverride: true, isAdmin };
  }
  return { canRelease: false, adminOverride: false, isAdmin, denyReason: 'no-permission' };
};

// Logged-in person and their release permission, evaluated against current data.
export const getSessionInfo = async (
  terminalId: string,
  equipment: Equipment | null
): Promise<TerminalSessionInfo | null> => {
  const stored = sessions.get(terminalId);
  if (!stored) {
    return null;
  }
  const member = stored.memberId ? await findMemberById(stored.memberId) : null;
  const decision = decideRelease(stored, member, equipment);
  return {
    memberId: stored.memberId ?? '',
    firstName: stored.firstName,
    lastName: stored.lastName,
    isAdmin: decision.isAdmin,
    canRelease: decision.canRelease,
    adminOverride: decision.adminOverride,
    denyReason: decision.denyReason,
    startedAt: new Date(stored.startedAt).toISOString(),
    expiresAt: new Date(stored.lastActivityAt + getIdleTimeoutMs()).toISOString(),
  };
};

// Used when a terminal is removed or its key rotated.
export const clearTerminalRuntime = async (terminalId: string): Promise<void> => {
  await endSession(terminalId, 'terminal-removed');
  lastScans.delete(terminalId);
};
