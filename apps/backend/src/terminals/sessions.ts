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
  TerminalState,
} from '../types/terminal';
import { toTerminalSummary, type StoredTerminal } from './repository';

// Who is logged in at which terminal. Kept in memory: a backend restart logs everyone out
// at the Pis. (Machine releases from phase 3 on are persisted separately.)

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

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;

// Logged in without activity for this long → logged out. Configurable for tests.
export const getIdleTimeoutMs = (): number => {
  const fromEnv = Number(process.env.TERMINAL_IDLE_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_IDLE_TIMEOUT_MS;
};

export const recordScan = (terminalId: string, result: TerminalScanResult): void => {
  lastScans.set(terminalId, { result, at: new Date().toISOString() });
};

// Records a scan that did not log anyone in (unknown tag, deactivated member) and tells the Pi.
export const reportRejectedScan = (terminalId: string, result: TerminalScanResult): void => {
  recordScan(terminalId, result);
  notifyTerminal(terminalId);
};

export const hasSession = (terminalId: string): boolean => sessions.has(terminalId);

export const startSession = (
  terminal: StoredTerminal,
  login: { member: Member | null; isAdminTag: boolean }
): void => {
  const now = Date.now();
  sessions.set(terminal.id, {
    memberId: login.member?.id ?? null,
    firstName: login.member?.firstName ?? 'Admin',
    lastName: login.member?.lastName ?? '',
    isAdminTag: login.isAdminTag,
    startedAt: now,
    lastActivityAt: now,
  });
  recordScan(terminal.id, 'login');
  notifyTerminal(terminal.id);
};

export type LogoutReason = 'scan' | 'button' | 'timeout' | 'terminal-removed';

export const endSession = (terminalId: string, reason: LogoutReason): boolean => {
  const session = sessions.get(terminalId);
  if (!session) {
    return false;
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
      endSession(terminalId, 'timeout');
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

const findEquipment = async (id: string): Promise<Equipment | null> => {
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

export const getTerminalState = async (terminal: StoredTerminal): Promise<TerminalState> => {
  const equipment = await findEquipment(terminal.equipmentId);
  const stored = sessions.get(terminal.id);

  let session: TerminalSessionInfo | null = null;
  if (stored) {
    const member = stored.memberId ? await findMemberById(stored.memberId) : null;
    const decision = decideRelease(stored, member, equipment);
    session = {
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
  }

  return {
    terminal: toTerminalSummary(terminal),
    equipment: equipment
      ? { id: equipment.id, name: equipment.name, isAvailable: equipment.isAvailable }
      : null,
    session,
    lastScan: lastScans.get(terminal.id),
  };
};

// Test hook / used when a terminal is removed.
export const clearTerminalRuntime = (terminalId: string): void => {
  endSession(terminalId, 'terminal-removed');
  lastScans.delete(terminalId);
};
