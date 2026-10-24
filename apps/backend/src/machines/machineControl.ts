import { nanoid } from 'nanoid';
import { getDatabase, getUsageDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import { getDriver } from '../shelly/driver';
import type { Equipment } from '../types/equipment';
import type {
  EquipmentControl,
  EquipmentUsage,
  MachineReleaseInfo,
  TerminalMachineState,
  UsageEndReason,
} from '../types/machine';
import type { ShellyComponentStatus, ShellyDevice } from '../types/shelly';
import { isTerminalOnline } from '../terminals/contact';
import { findTerminalById, type StoredTerminal } from '../terminals/repository';
import {
  endSession,
  findEquipment,
  getSessionInfo,
  hasSession,
  notifyTerminalChanged,
  setSessionEndHandler,
  startSession,
  touchSession,
  type LogoutReason,
} from '../terminals/sessions';
import { DEFAULT_STILL_THERE_MINUTES, machineTickMs, minuteMs } from './timing';

// Machine releases (docs/shelly-plan.md, phase 3).
//
// Releasing switches the machine's Shelly output on with an auto-off timer ("watchdog").
// While the release lasts and the Pi keeps calling in, the backend renews that timer.
// If the backend, the network or the Pi fails, the Shelly switches the machine off by itself
// when the timer runs out. Every release is stored as an EquipmentUsage document; open
// documents are picked up again after a backend restart.

type StoredUsage = EquipmentUsage & { _id: string; _rev: string };
type StoredDevice = ShellyDevice & { _id: string; _rev: string };

interface ActiveRelease {
  usage: StoredUsage;
  terminalId: string;
  control: EquipmentControl;
  device: StoredDevice;
  lastRenewOkAt: number;
  lastRenewAttemptAt: number;
  // Start of the current "Noch da?" period (release start or last confirmation).
  cycleStartedAt: number;
  stillThereAskedAt: number | null;
  stopping: boolean;
}

const releases = new Map<string, ActiveRelease>();

export class MachineError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'MachineError';
  }
}

// ---------------------------------------------------------------------------
// Shelly access
// ---------------------------------------------------------------------------

export const findShellyDevice = async (id: string): Promise<StoredDevice | null> => {
  const db = getDatabase<ShellyDevice>();
  const result = await db.find({
    selector: { type: { $eq: 'shellyDevice' }, id: { $eq: id }, isActive: { $eq: true } },
    limit: 1,
  });
  return (result.docs[0] as StoredDevice | undefined) ?? null;
};

const watchdogMs = (control: EquipmentControl): number => control.watchdogMinutes * minuteMs();

const switchOutput = async (
  device: ShellyDevice,
  control: EquipmentControl,
  on: boolean,
  autoOffSec?: number
): Promise<void> => {
  const driver = getDriver(device.gen);
  if (control.kind === 'switch') {
    await driver.setSwitch(device.host, control.index, on, autoOffSec);
  } else {
    await driver.setLight(device.host, control.index, on, undefined, autoOffSec);
  }
};

const switchOnWithWatchdog = async (
  device: ShellyDevice,
  control: EquipmentControl
): Promise<void> => {
  const autoOffSec = Math.max(1, Math.round(watchdogMs(control) / 1000));
  await switchOutput(device, control, true, autoOffSec);
};

// Short cache so state polls from the Pi do not query the Shelly every time.
const STATUS_CACHE_MS = 3000;
const statusCache = new Map<
  string,
  { at: number; online: boolean; components: ShellyComponentStatus[] }
>();

const readOutputStatus = async (
  device: ShellyDevice,
  control: EquipmentControl
): Promise<{ online: boolean; on?: boolean }> => {
  const cached = statusCache.get(device.id);
  let entry = cached && Date.now() - cached.at < STATUS_CACHE_MS ? cached : undefined;
  if (!entry) {
    try {
      const components = await getDriver(device.gen).getStatus(device.host, device.components);
      entry = { at: Date.now(), online: true, components };
    } catch {
      entry = { at: Date.now(), online: false, components: [] };
    }
    statusCache.set(device.id, entry);
  }
  const output = entry.components.find((c) => c.kind === control.kind && c.index === control.index);
  return { online: entry.online, on: output?.on };
};

// ---------------------------------------------------------------------------
// Usage records
// ---------------------------------------------------------------------------

const closeUsage = async (usage: StoredUsage, reason: UsageEndReason): Promise<void> => {
  const db = getUsageDatabase();
  const endedAt = new Date();
  let current: StoredUsage = usage;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.insert({
        ...current,
        endedAt: endedAt.toISOString(),
        durationSec: Math.max(
          0,
          Math.round((endedAt.getTime() - Date.parse(current.startedAt)) / 1000)
        ),
        endReason: reason,
      });
      return;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) {
        throw err;
      }
      current = (await db.get(usage._id)) as StoredUsage;
    }
  }
};

// ---------------------------------------------------------------------------
// Release and stop
// ---------------------------------------------------------------------------

export const isReleased = (terminalId: string): boolean => releases.has(terminalId);

export const isDeviceInUse = (deviceId: string): boolean =>
  [...releases.values()].some((r) => r.device.id === deviceId);

export const isEquipmentReleased = (equipmentId: string): boolean =>
  [...releases.values()].some((r) => r.usage.equipmentId === equipmentId);

const releaseInfo = (release: ActiveRelease, terminal: StoredTerminal): MachineReleaseInfo => {
  const stillThereMinutes = terminal.stillThereTimeoutMinutes ?? DEFAULT_STILL_THERE_MINUTES;
  return {
    usageId: release.usage.id,
    memberId: release.usage.memberId,
    memberName: release.usage.memberName,
    startedAt: release.usage.startedAt,
    adminOverride: release.usage.adminOverride,
    stillThere: release.stillThereAskedAt
      ? {
          askedAt: new Date(release.stillThereAskedAt).toISOString(),
          deadline: new Date(
            release.stillThereAskedAt + stillThereMinutes * minuteMs()
          ).toISOString(),
        }
      : undefined,
  };
};

/**
 * "Maschine freigeben" at a terminal. Requires a logged-in person who may release this
 * machine, a configured Shelly output and a reachable Shelly. Releasing twice is a no-op.
 */
export const releaseMachine = async (terminal: StoredTerminal): Promise<void> => {
  if (releases.has(terminal.id)) {
    return;
  }

  const equipment = await findEquipment(terminal.equipmentId);
  const session = await getSessionInfo(terminal.id, equipment);
  if (!session) {
    throw new MachineError('Niemand angemeldet', 409, 'not-logged-in');
  }
  if (!session.canRelease) {
    void logAuditEvent({
      action: 'machine.release.denied',
      actorId: session.memberId || undefined,
      targetType: 'equipment',
      targetId: terminal.equipmentId,
      relatedId: terminal.id,
      source: 'terminal',
    });
    throw new MachineError('Keine Berechtigung für diese Maschine', 403, 'no-permission');
  }

  const control = equipment?.control;
  const device = control ? await findShellyDevice(control.deviceId) : null;
  if (!equipment || !control || !device) {
    throw new MachineError(
      'Diese Maschine ist noch keinem Shelly zugeordnet',
      409,
      'not-configured'
    );
  }

  try {
    await switchOnWithWatchdog(device, control);
  } catch {
    statusCache.delete(device.id);
    throw new MachineError('Shelly nicht erreichbar', 502, 'device-offline');
  }
  statusCache.delete(device.id);

  const now = Date.now();
  const usage: EquipmentUsage = {
    type: 'equipmentUsage',
    id: nanoid(),
    equipmentId: equipment.id,
    terminalId: terminal.id,
    memberId: session.memberId || null,
    memberName: `${session.firstName} ${session.lastName}`.trim(),
    adminOverride: session.adminOverride,
    startedAt: new Date(now).toISOString(),
  };

  let stored: StoredUsage;
  try {
    const result = await getUsageDatabase().insert(usage);
    stored = { ...usage, _id: result.id, _rev: result.rev };
  } catch (err) {
    // Without a record the release must not continue.
    await switchOutput(device, control, false).catch(() => undefined);
    throw err;
  }

  releases.set(terminal.id, {
    usage: stored,
    terminalId: terminal.id,
    control,
    device,
    lastRenewOkAt: now,
    lastRenewAttemptAt: now,
    cycleStartedAt: now,
    stillThereAskedAt: null,
    stopping: false,
  });
  touchSession(terminal.id);

  void logAuditEvent({
    action: session.adminOverride ? 'machine.release.admin-override' : 'machine.release',
    actorId: session.memberId || undefined,
    targetType: 'equipment',
    targetId: equipment.id,
    relatedId: terminal.id,
    source: 'terminal',
  });
  notifyTerminalChanged(terminal.id);
};

/**
 * Ends a release: switches the output off (best effort; the Shelly's own timer is the
 * fallback) and closes the usage record.
 */
export const stopMachine = async (terminalId: string, reason: UsageEndReason): Promise<void> => {
  const release = releases.get(terminalId);
  if (!release || release.stopping) {
    return;
  }
  release.stopping = true;

  try {
    await switchOutput(release.device, release.control, false);
  } catch (err) {
    console.warn(
      `[machines] Could not switch off ${release.device.name}; its safety timer will: ${
        (err as Error).message
      }`
    );
  }
  statusCache.delete(release.device.id);

  try {
    await closeUsage(release.usage, reason);
  } catch (err) {
    console.error('[machines] Failed to close usage record:', err);
  }

  releases.delete(terminalId);
  void logAuditEvent({
    action: `machine.off.${reason}`,
    actorId: release.usage.memberId ?? undefined,
    targetType: 'equipment',
    targetId: release.usage.equipmentId,
    relatedId: terminalId,
    source: 'terminal',
  });
  notifyTerminalChanged(terminalId);
};

// "Ja, noch da" on the Pi: starts a new period.
export const confirmStillThere = (terminalId: string): boolean => {
  const release = releases.get(terminalId);
  if (!release) {
    return false;
  }
  release.cycleStartedAt = Date.now();
  release.stillThereAskedAt = null;
  touchSession(terminalId);
  notifyTerminalChanged(terminalId);
  return true;
};

const LOGOUT_TO_USAGE_REASON: Record<LogoutReason, UsageEndReason> = {
  scan: 'logout',
  button: 'logout',
  timeout: 'timeout',
  'terminal-removed': 'admin',
  'terminal-offline': 'terminal-offline',
};

// ---------------------------------------------------------------------------
// Control loop
// ---------------------------------------------------------------------------

const checkStillThere = async (release: ActiveRelease, now: number): Promise<boolean> => {
  const terminal = await findTerminalById(release.terminalId);
  if (!terminal) {
    await stopMachine(release.terminalId, 'admin');
    return true;
  }
  if (!terminal.maxSessionMinutes) {
    return false;
  }

  if (release.stillThereAskedAt === null) {
    if (now - release.cycleStartedAt >= terminal.maxSessionMinutes * minuteMs()) {
      release.stillThereAskedAt = now;
      void logAuditEvent({
        action: 'machine.still-there.asked',
        actorId: release.usage.memberId ?? undefined,
        targetType: 'equipment',
        targetId: release.usage.equipmentId,
        relatedId: release.terminalId,
        source: 'terminal',
      });
      notifyTerminalChanged(release.terminalId);
    }
    return false;
  }

  const answerMs = (terminal.stillThereTimeoutMinutes ?? DEFAULT_STILL_THERE_MINUTES) * minuteMs();
  if (now - release.stillThereAskedAt >= answerMs) {
    // No answer: log out, which switches the machine off with reason "timeout".
    await endSession(release.terminalId, 'timeout');
    await stopMachine(release.terminalId, 'timeout');
    return true;
  }
  return false;
};

const tickRelease = async (release: ActiveRelease): Promise<void> => {
  if (release.stopping) {
    return;
  }
  const now = Date.now();
  const piOnline = isTerminalOnline(release.terminalId);

  // A released machine never runs into the idle logout.
  touchSession(release.terminalId);

  if (await checkStillThere(release, now)) {
    return;
  }

  // Timer ran out without a successful renewal: the Shelly has switched off by itself.
  if (now - release.lastRenewOkAt >= watchdogMs(release.control)) {
    if (piOnline) {
      await stopMachine(release.terminalId, 'device-offline');
    } else {
      await endSession(release.terminalId, 'terminal-offline');
      await stopMachine(release.terminalId, 'terminal-offline');
    }
    return;
  }

  // Pi offline: stop renewing so the machine runs until the timer ends (plan decision).
  if (!piOnline) {
    return;
  }

  const renewEveryMs = Math.max(500, Math.floor(watchdogMs(release.control) / 3));
  if (now - release.lastRenewAttemptAt < renewEveryMs) {
    return;
  }
  release.lastRenewAttemptAt = now;
  try {
    await switchOnWithWatchdog(release.device, release.control);
    release.lastRenewOkAt = Date.now();
  } catch (err) {
    console.warn(`[machines] Renewing ${release.device.name} failed: ${(err as Error).message}`);
  }
};

let ticking = false;

export const tickMachines = async (): Promise<void> => {
  if (ticking) {
    return;
  }
  ticking = true;
  try {
    for (const release of [...releases.values()]) {
      try {
        await tickRelease(release);
      } catch (err) {
        console.error('[machines] Control loop error:', err);
      }
    }
  } finally {
    ticking = false;
  }
};

// After a restart: continue open releases and restore their login at the Pi.
const restoreReleases = async (): Promise<void> => {
  const db = getUsageDatabase();
  const open = await db.find({
    selector: { type: { $eq: 'equipmentUsage' }, endedAt: { $exists: false } },
    limit: 1000,
  });

  for (const doc of open.docs as StoredUsage[]) {
    const terminal = await findTerminalById(doc.terminalId);
    const equipment: Equipment | null = terminal ? await findEquipment(doc.equipmentId) : null;
    const control = equipment?.control;
    const device = control ? await findShellyDevice(control.deviceId) : null;
    if (!terminal || !control || !device || terminal.equipmentId !== doc.equipmentId) {
      await closeUsage(doc, 'system');
      continue;
    }

    const now = Date.now();
    releases.set(terminal.id, {
      usage: doc,
      terminalId: terminal.id,
      control,
      device,
      // Unknown whether the Shelly is still on; renew right away and give it one timer period.
      lastRenewOkAt: now,
      lastRenewAttemptAt: 0,
      cycleStartedAt: now,
      stillThereAskedAt: null,
      stopping: false,
    });
    if (!hasSession(terminal.id)) {
      const [firstName, ...rest] = doc.memberName.split(' ');
      startSession(
        terminal,
        {
          memberId: doc.memberId,
          firstName: firstName || 'Admin',
          lastName: rest.join(' '),
          isAdminTag: doc.memberId === null,
        },
        { silent: true }
      );
    }
    console.log(`[machines] Restored release of ${equipment?.name} at ${terminal.name}`);
  }
};

let loop: ReturnType<typeof setInterval> | null = null;

export const startMachineControl = async (): Promise<void> => {
  // Logging out at a terminal switches its machine off.
  setSessionEndHandler(async (terminalId: string, reason: LogoutReason) => {
    await stopMachine(terminalId, LOGOUT_TO_USAGE_REASON[reason]);
  });

  try {
    await restoreReleases();
  } catch (err) {
    console.error('[machines] Failed to restore releases:', err);
  }

  if (!loop) {
    loop = setInterval(() => {
      void tickMachines();
    }, machineTickMs());
    loop.unref();
  }
};

// ---------------------------------------------------------------------------
// State for the Pi
// ---------------------------------------------------------------------------

export const getMachineState = async (
  terminal: StoredTerminal,
  equipment: Equipment | null
): Promise<TerminalMachineState> => {
  const release = releases.get(terminal.id);
  const control = equipment?.control;
  const device = control ? await findShellyDevice(control.deviceId) : null;

  if (!control || !device) {
    return { configured: false, online: false, blockReason: 'not-configured', release: null };
  }

  const status = await readOutputStatus(device, control);
  return {
    configured: true,
    online: status.online,
    on: status.on,
    blockReason: status.online ? undefined : 'device-offline',
    release: release ? releaseInfo(release, terminal) : null,
  };
};
