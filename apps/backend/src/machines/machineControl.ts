import { nanoid } from 'nanoid';
import { getUsageDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import { getDriver } from '../shelly/driver';
import type { Equipment } from '../types/equipment';
import type {
  EquipmentControl,
  EquipmentUsage,
  MachineExtraRequest,
  MachineMeterRef,
  MachineReleaseInfo,
  TerminalMachineState,
  UsageEndReason,
} from '../types/machine';
import type { ShellyComponentStatus, ShellyDevice } from '../types/shelly';
import type { TerminalSessionInfo } from '../types/terminal';
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
import {
  findComponent,
  findShellyDevice,
  invalidateDeviceStatus,
  readDeviceStatus,
  type StoredDevice,
} from './deviceStatus';

import {
  cachedDeviceLookup,
  isValidExtraAction,
  operateExtra,
  readExtras,
  readInterlocks,
  switchOffExtras,
  type DeviceLookup,
} from './accessories';

export { findShellyDevice } from './deviceStatus';

// Machine releases (docs/shelly-plan.md, phases 3 and 4).
//
// Releasing switches the machine's Shelly output on with an auto-off timer ("watchdog").
// While the release lasts and the Pi keeps calling in, the backend renews that timer.
// If the backend, the network or the Pi fails, the Shelly switches the machine off by itself
// when the timer runs out. Every release is stored as an EquipmentUsage document; open
// documents are picked up again after a backend restart.
//
// Shutdown modes (per machine): "immediate" switches off at logout; "when-idle" keeps the
// machine running after logout until its power stays below a threshold (job finished), at the
// latest after a maximum wait. A permitted member can take over during that wait.

type StoredUsage = EquipmentUsage & { _id: string; _rev: string };

interface PendingShutdown {
  since: number;
  // Since when the power has been below the threshold (null = not idle).
  idleSince: number | null;
  reason: UsageEndReason;
}

interface ActiveRelease {
  usage: StoredUsage;
  terminalId: string;
  control: EquipmentControl;
  device: StoredDevice;
  // Device that measures the power: the output's own device, a separate one, or none.
  meterDevice: StoredDevice | null;
  // Cached device docs for safety inputs and extras.
  lookup: DeviceLookup;
  // Since when a safety input could not be read (null = all readable).
  interlockUnknownSince: number | null;
  lastRenewOkAt: number;
  lastRenewAttemptAt: number;
  // Start of the current "Noch da?" period (release start or last confirmation).
  cycleStartedAt: number;
  stillThereAskedAt: number | null;
  shutdown: PendingShutdown | null;
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

/**
 * Where the machine's power is measured: a separate meter if configured, otherwise the
 * output itself if it has metering (e.g. Plus 1PM), otherwise nowhere.
 */
export const meterRefFor = (
  control: EquipmentControl,
  outputDevice: ShellyDevice
): MachineMeterRef | null => {
  if (control.meter) {
    return control.meter;
  }
  const output = outputDevice.components.find(
    (c) => c.kind === control.kind && c.index === control.index
  );
  return output?.hasPowerMeter
    ? { deviceId: outputDevice.id, kind: control.kind, index: control.index }
    : null;
};

const resolveMeterDevice = async (
  control: EquipmentControl,
  outputDevice: StoredDevice
): Promise<StoredDevice | null> => {
  const ref = meterRefFor(control, outputDevice);
  if (!ref) {
    return null;
  }
  return ref.deviceId === outputDevice.id ? outputDevice : findShellyDevice(ref.deviceId);
};

interface MeterReading {
  powerW?: number;
  energyWh?: number;
}

const readMeter = async (
  control: EquipmentControl,
  outputDevice: ShellyDevice,
  meterDevice: ShellyDevice | null,
  options: { fresh?: boolean } = {}
): Promise<MeterReading> => {
  const ref = meterRefFor(control, outputDevice);
  if (!ref || !meterDevice) {
    return {};
  }
  const status = await readDeviceStatus(meterDevice, options);
  const component = findComponent(status, ref);
  return { powerW: component?.powerW, energyWh: component?.energyWh };
};

// ---------------------------------------------------------------------------
// Usage records
// ---------------------------------------------------------------------------

const updateUsage = async (
  usage: StoredUsage,
  patch: (current: StoredUsage) => StoredUsage
): Promise<StoredUsage> => {
  const db = getUsageDatabase();
  let current: StoredUsage = usage;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const next = patch(current);
      const result = await db.insert(next);
      return { ...next, _rev: result.rev };
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) {
        throw err;
      }
      current = (await db.get(usage._id)) as StoredUsage;
    }
  }
  throw new Error('Usage record could not be updated (conflict)');
};

const energyUsed = (startWh: number | undefined, endWh: number | undefined): number | undefined => {
  if (startWh === undefined || endWh === undefined || endWh < startWh) {
    // Counter missing or reset (e.g. Shelly rebooted): unknown.
    return undefined;
  }
  return Math.round((endWh - startWh) * 100) / 100;
};

const closeUsage = async (
  usage: StoredUsage,
  reason: UsageEndReason,
  endEnergyWh?: number
): Promise<void> => {
  const endedAt = new Date();
  await updateUsage(usage, (current) => {
    const energyWh = energyUsed(current.startEnergyWh, endEnergyWh);
    return {
      ...current,
      endedAt: endedAt.toISOString(),
      durationSec: Math.max(
        0,
        Math.round((endedAt.getTime() - Date.parse(current.startedAt)) / 1000)
      ),
      endReason: reason,
      ...(energyWh !== undefined ? { energyWh } : {}),
    };
  });
};

const createUsage = async (
  terminal: StoredTerminal,
  equipment: Equipment,
  session: TerminalSessionInfo,
  startEnergyWh: number | undefined
): Promise<StoredUsage> => {
  const usage: EquipmentUsage = {
    type: 'equipmentUsage',
    id: nanoid(),
    equipmentId: equipment.id,
    terminalId: terminal.id,
    memberId: session.memberId || null,
    memberName: `${session.firstName} ${session.lastName}`.trim(),
    adminOverride: session.adminOverride,
    startedAt: new Date().toISOString(),
    ...(startEnergyWh !== undefined ? { startEnergyWh } : {}),
  };
  const result = await getUsageDatabase().insert(usage);
  return { ...usage, _id: result.id, _rev: result.rev };
};

// ---------------------------------------------------------------------------
// Release and stop
// ---------------------------------------------------------------------------

export const isReleased = (terminalId: string): boolean => releases.has(terminalId);

export const getReleaseSummary = (
  terminalId: string
): {
  memberName: string;
  startedAt: string;
  adminOverride: boolean;
  shuttingDown: boolean;
} | null => {
  const release = releases.get(terminalId);
  if (!release) {
    return null;
  }
  return {
    memberName: release.usage.memberName,
    startedAt: release.usage.startedAt,
    adminOverride: release.usage.adminOverride,
    shuttingDown: release.shutdown !== null,
  };
};

/**
 * Admin switches a running machine off remotely (phase 6). The person at the Pi stays logged
 * in. Returns false when the machine is not released.
 */
export const forceStopMachine = async (equipmentId: string): Promise<boolean> => {
  const release = [...releases.values()].find((r) => r.usage.equipmentId === equipmentId);
  if (!release) {
    return false;
  }
  await stopMachine(release.terminalId, 'admin');
  return true;
};

export const isDeviceInUse = (deviceId: string): boolean =>
  [...releases.values()].some((r) => r.device.id === deviceId || r.meterDevice?.id === deviceId);

export const isEquipmentReleased = (equipmentId: string): boolean =>
  [...releases.values()].some((r) => r.usage.equipmentId === equipmentId);

const shutdownDeadline = (release: ActiveRelease): number | null => {
  const { shutdown } = release;
  if (!shutdown || release.control.shutdown.mode !== 'when-idle') {
    return null;
  }
  return shutdown.since + release.control.shutdown.maxWaitMinutes * minuteMs();
};

const releaseInfo = (release: ActiveRelease, terminal: StoredTerminal): MachineReleaseInfo => {
  const stillThereMinutes = terminal.stillThereTimeoutMinutes ?? DEFAULT_STILL_THERE_MINUTES;
  const deadline = shutdownDeadline(release);
  const shutdownConfig = release.control.shutdown;
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
    shuttingDown:
      release.shutdown && deadline !== null && shutdownConfig.mode === 'when-idle'
        ? {
            since: new Date(release.shutdown.since).toISOString(),
            deadline: new Date(deadline).toISOString(),
            idleThresholdW: shutdownConfig.idleThresholdW,
          }
        : undefined,
  };
};

const auditMachine = (
  action: string,
  release: ActiveRelease | null,
  extra: {
    actorId?: string;
    equipmentId: string;
    terminalId: string;
  }
): void => {
  void logAuditEvent({
    action,
    actorId: extra.actorId ?? release?.usage.memberId ?? undefined,
    targetType: 'equipment',
    targetId: extra.equipmentId,
    relatedId: extra.terminalId,
    source: 'terminal',
  });
};

/**
 * "Maschine freigeben" at a terminal. Requires a logged-in person who may release this
 * machine, a configured Shelly output and a reachable Shelly. Releasing twice is a no-op.
 * While the machine waits to switch off after a logout ("when idle"), a permitted member can
 * take it over without interruption.
 */
export const releaseMachine = async (terminal: StoredTerminal): Promise<void> => {
  const existing = releases.get(terminal.id);
  if (existing && !existing.shutdown) {
    return;
  }

  const equipment = await findEquipment(terminal.equipmentId);
  const session = await getSessionInfo(terminal.id, equipment);
  if (!session) {
    throw new MachineError('Niemand angemeldet', 409, 'not-logged-in');
  }
  if (!session.canRelease) {
    auditMachine('machine.release.denied', null, {
      actorId: session.memberId || undefined,
      equipmentId: terminal.equipmentId,
      terminalId: terminal.id,
    });
    throw new MachineError('Keine Berechtigung für diese Maschine', 403, 'no-permission');
  }

  if (existing?.shutdown) {
    await takeOver(existing, terminal, equipment, session);
    return;
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
  const meterDevice = await resolveMeterDevice(control, device);
  const lookup = cachedDeviceLookup();

  // Safety inputs must be in their safe state (and readable) before switching on.
  const interlocks = await readInterlocks(control, lookup, { fresh: true });
  const notOk = interlocks.find((i) => i.ok !== true);
  if (notOk) {
    throw new MachineError(
      notOk.ok === null
        ? `Sicherheits-Eingang nicht lesbar: ${notOk.label}`
        : `Sicherheits-Eingang nicht in Ordnung: ${notOk.label}`,
      409,
      'interlock-open'
    );
  }

  try {
    await switchOnWithWatchdog(device, control);
  } catch {
    invalidateDeviceStatus(device.id);
    throw new MachineError('Shelly nicht erreichbar', 502, 'device-offline');
  }
  invalidateDeviceStatus(device.id);

  const start = await readMeter(control, device, meterDevice, { fresh: true });
  let usage: StoredUsage;
  try {
    usage = await createUsage(terminal, equipment, session, start.energyWh);
  } catch (err) {
    // Without a record the release must not continue.
    await switchOutput(device, control, false).catch(() => undefined);
    throw err;
  }

  const now = Date.now();
  releases.set(terminal.id, {
    usage,
    terminalId: terminal.id,
    control,
    device,
    meterDevice,
    lookup,
    interlockUnknownSince: null,
    lastRenewOkAt: now,
    lastRenewAttemptAt: now,
    cycleStartedAt: now,
    stillThereAskedAt: null,
    shutdown: null,
    stopping: false,
  });
  touchSession(terminal.id);

  auditMachine(session.adminOverride ? 'machine.release.admin-override' : 'machine.release', null, {
    actorId: session.memberId || undefined,
    equipmentId: equipment.id,
    terminalId: terminal.id,
  });
  notifyTerminalChanged(terminal.id);
};

// A new member takes over a machine that is waiting to switch off.
const takeOver = async (
  release: ActiveRelease,
  terminal: StoredTerminal,
  equipment: Equipment | null,
  session: TerminalSessionInfo
): Promise<void> => {
  if (!equipment) {
    throw new MachineError('Ausstattung nicht gefunden', 409, 'not-configured');
  }
  const reading = await readMeter(release.control, release.device, release.meterDevice, {
    fresh: true,
  });
  await closeUsage(release.usage, 'handover', reading.energyWh);
  release.usage = await createUsage(terminal, equipment, session, reading.energyWh);
  release.shutdown = null;
  release.cycleStartedAt = Date.now();
  release.stillThereAskedAt = null;
  touchSession(terminal.id);

  auditMachine('machine.release.handover', release, {
    actorId: session.memberId || undefined,
    equipmentId: equipment.id,
    terminalId: terminal.id,
  });
  notifyTerminalChanged(terminal.id);
};

/**
 * Ends a release: switches the output off (best effort; the Shelly's own timer is the
 * fallback) and closes the usage record with the energy used.
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
  invalidateDeviceStatus(release.device.id);
  await switchOffExtras(release.control, release.lookup);

  const reading = await readMeter(release.control, release.device, release.meterDevice, {
    fresh: true,
  });
  try {
    await closeUsage(release.usage, reason, reading.energyWh);
  } catch (err) {
    console.error('[machines] Failed to close usage record:', err);
  }

  releases.delete(terminalId);
  auditMachine(`machine.off.${reason}`, release, {
    equipmentId: release.usage.equipmentId,
    terminalId,
  });
  notifyTerminalChanged(terminalId);
};

/**
 * Logout or "Noch da?" timeout: "immediate" machines switch off now, "when idle" machines
 * keep running until their power stays low.
 */
const beginShutdown = async (terminalId: string, reason: UsageEndReason): Promise<void> => {
  const release = releases.get(terminalId);
  if (!release || release.stopping || release.shutdown) {
    return;
  }
  if (release.control.shutdown.mode !== 'when-idle' || !release.meterDevice) {
    await stopMachine(terminalId, reason);
    return;
  }

  const now = Date.now();
  release.shutdown = { since: now, idleSince: null, reason };
  release.stillThereAskedAt = null;
  try {
    release.usage = await updateUsage(release.usage, (current) => ({
      ...current,
      shutdownRequestedAt: new Date(now).toISOString(),
      shutdownReason: reason,
    }));
  } catch (err) {
    console.error('[machines] Failed to store pending shutdown:', err);
  }
  auditMachine('machine.shutdown.when-idle', release, {
    equipmentId: release.usage.equipmentId,
    terminalId,
  });
  notifyTerminalChanged(terminalId);
};

// "Ja, noch da" on the Pi: starts a new period.
export const confirmStillThere = (terminalId: string): boolean => {
  const release = releases.get(terminalId);
  if (!release || release.shutdown) {
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

// Logout reasons after which a "when idle" machine may keep running until its job ends.
const GRACEFUL_LOGOUTS: LogoutReason[] = ['scan', 'button', 'timeout'];

// ---------------------------------------------------------------------------
// Control loop
// ---------------------------------------------------------------------------

const checkStillThere = async (
  release: ActiveRelease,
  terminal: StoredTerminal,
  now: number
): Promise<boolean> => {
  if (!terminal.maxSessionMinutes || release.shutdown) {
    return false;
  }

  if (release.stillThereAskedAt === null) {
    if (now - release.cycleStartedAt >= terminal.maxSessionMinutes * minuteMs()) {
      release.stillThereAskedAt = now;
      auditMachine('machine.still-there.asked', release, {
        equipmentId: release.usage.equipmentId,
        terminalId: release.terminalId,
      });
      notifyTerminalChanged(release.terminalId);
    }
    return false;
  }

  const answerMs = (terminal.stillThereTimeoutMinutes ?? DEFAULT_STILL_THERE_MINUTES) * minuteMs();
  if (now - release.stillThereAskedAt >= answerMs) {
    // No answer: log out; the session end handler switches off (or waits for idle).
    if (!(await endSession(release.terminalId, 'timeout'))) {
      await beginShutdown(release.terminalId, 'timeout');
    }
    return true;
  }
  return false;
};

// Waiting for the machine to become idle after a logout.
const checkIdleShutdown = async (release: ActiveRelease, now: number): Promise<boolean> => {
  const { shutdown } = release;
  const config = release.control.shutdown;
  if (!shutdown || config.mode !== 'when-idle') {
    return false;
  }

  const deadline = shutdownDeadline(release);
  if (deadline !== null && now >= deadline) {
    await stopMachine(release.terminalId, shutdown.reason);
    return true;
  }

  const { powerW } = await readMeter(release.control, release.device, release.meterDevice);
  // Unknown power counts as busy; the maximum wait still applies.
  if (powerW !== undefined && powerW < config.idleThresholdW) {
    shutdown.idleSince = shutdown.idleSince ?? now;
    if (now - shutdown.idleSince >= config.idleSeconds * 1000) {
      await stopMachine(release.terminalId, shutdown.reason);
      return true;
    }
  } else {
    shutdown.idleSince = null;
  }
  return false;
};

/**
 * A safety input left its safe state: switch off immediately, whatever the shutdown mode.
 * An input that cannot be read is tolerated for one safety-timer period (Wi-Fi hiccups);
 * after that the machine is switched off as well. The member stays logged in.
 */
const checkInterlocks = async (release: ActiveRelease, now: number): Promise<boolean> => {
  if (!release.control.interlocks?.length) {
    return false;
  }
  const readings = await readInterlocks(release.control, release.lookup);
  const open = readings.find((r) => r.ok === false);
  if (open) {
    auditMachine('machine.interlock.open', release, {
      equipmentId: release.usage.equipmentId,
      terminalId: release.terminalId,
    });
    await stopMachine(release.terminalId, 'interlock');
    return true;
  }
  if (readings.some((r) => r.ok === null)) {
    release.interlockUnknownSince = release.interlockUnknownSince ?? now;
    if (now - release.interlockUnknownSince >= watchdogMs(release.control)) {
      await stopMachine(release.terminalId, 'interlock');
      return true;
    }
  } else {
    release.interlockUnknownSince = null;
  }
  return false;
};

const tickRelease = async (release: ActiveRelease): Promise<void> => {
  if (release.stopping) {
    return;
  }
  const now = Date.now();
  const piOnline = isTerminalOnline(release.terminalId);

  const terminal = await findTerminalById(release.terminalId);
  if (!terminal) {
    await stopMachine(release.terminalId, 'admin');
    return;
  }

  if (await checkInterlocks(release, now)) {
    return;
  }

  if (!release.shutdown) {
    // A released machine never runs into the idle logout.
    touchSession(release.terminalId);
  }

  if (await checkStillThere(release, terminal, now)) {
    return;
  }
  if (await checkIdleShutdown(release, now)) {
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

/**
 * A Shelly reported a change (webhook): check the releases that use it right away instead of
 * waiting for the next round of the control loop. Returns how many releases were checked.
 */
export const checkReleasesForDevice = async (deviceId: string): Promise<number> => {
  invalidateDeviceStatus(deviceId);
  const affected = [...releases.values()].filter(
    (r) =>
      r.device.id === deviceId ||
      r.meterDevice?.id === deviceId ||
      r.control.interlocks?.some((i) => i.deviceId === deviceId)
  );
  for (const release of affected) {
    try {
      await tickRelease(release);
    } catch (err) {
      console.error('[machines] Event check failed:', err);
    }
  }
  return affected.length;
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
    const pendingShutdown =
      doc.shutdownRequestedAt && control.shutdown.mode === 'when-idle'
        ? {
            since: Date.parse(doc.shutdownRequestedAt),
            idleSince: null,
            reason: doc.shutdownReason ?? 'logout',
          }
        : null;
    releases.set(terminal.id, {
      usage: doc,
      terminalId: terminal.id,
      control,
      device,
      meterDevice: await resolveMeterDevice(control, device),
      lookup: cachedDeviceLookup(),
      interlockUnknownSince: null,
      // Unknown whether the Shelly is still on; renew right away and give it one timer period.
      lastRenewOkAt: now,
      lastRenewAttemptAt: 0,
      cycleStartedAt: now,
      stillThereAskedAt: null,
      shutdown: pendingShutdown,
      stopping: false,
    });
    // The member is still logged in unless they had already logged out.
    if (!pendingShutdown && !hasSession(terminal.id)) {
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
  // Logging out at a terminal ends its release (immediately or once the machine is idle).
  setSessionEndHandler(async (terminalId: string, reason: LogoutReason) => {
    const usageReason = LOGOUT_TO_USAGE_REASON[reason];
    if (GRACEFUL_LOGOUTS.includes(reason)) {
      await beginShutdown(terminalId, usageReason);
    } else {
      await stopMachine(terminalId, usageReason);
    }
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
    return {
      configured: false,
      online: false,
      metered: false,
      blockReason: 'not-configured',
      release: null,
      interlocks: [],
      extras: [],
    };
  }

  const lookup = release?.lookup ?? cachedDeviceLookup();
  const status = await readDeviceStatus(device);
  const meterDevice = release?.meterDevice ?? (await resolveMeterDevice(control, device));
  const [reading, interlocks, extras] = await Promise.all([
    readMeter(control, device, meterDevice),
    readInterlocks(control, lookup),
    readExtras(control, lookup),
  ]);

  let blockReason: TerminalMachineState['blockReason'];
  if (!status.online) {
    blockReason = 'device-offline';
  } else if (interlocks.some((i) => i.ok !== true)) {
    blockReason = 'interlock-open';
  }

  return {
    configured: true,
    online: status.online,
    on: findComponent(status, control)?.on,
    metered: meterDevice !== null,
    shutdownMode: meterDevice ? control.shutdown.mode : 'immediate',
    powerW: reading.powerW,
    blockReason,
    release: release ? releaseInfo(release, terminal) : null,
    interlocks,
    extras,
  };
};

/**
 * Operates an extra control (dimmer, blinds, extraction) from the Pi. Only while the machine
 * is released and the logged-in person may release it.
 */
export const operateMachineExtra = async (
  terminal: StoredTerminal,
  extraId: string,
  request: MachineExtraRequest
): Promise<void> => {
  const release = releases.get(terminal.id);
  if (!release || release.shutdown) {
    throw new MachineError('Die Maschine ist nicht freigegeben', 409, 'not-released');
  }
  const equipment = await findEquipment(terminal.equipmentId);
  const session = await getSessionInfo(terminal.id, equipment);
  if (!session?.canRelease) {
    throw new MachineError('Keine Berechtigung für diese Maschine', 403, 'no-permission');
  }
  const extra = release.control.extras?.find((e) => e.id === extraId);
  if (!extra) {
    throw new MachineError('Zusatzfunktion nicht gefunden', 404, 'not-found');
  }
  if (!isValidExtraAction(extra, request)) {
    throw new MachineError('Diese Aktion passt nicht zur Zusatzfunktion', 400, 'invalid-action');
  }
  const device = await release.lookup(extra.deviceId);
  if (!device) {
    throw new MachineError('Shelly nicht gefunden', 409, 'device-offline');
  }
  try {
    await operateExtra(extra, device, request);
  } catch {
    throw new MachineError('Shelly nicht erreichbar', 502, 'device-offline');
  }
  touchSession(terminal.id);
  auditMachine(`machine.extra.${request.action}`, release, {
    actorId: session.memberId || undefined,
    equipmentId: release.usage.equipmentId,
    terminalId: terminal.id,
  });
  notifyTerminalChanged(terminal.id);
};
