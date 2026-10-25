import { Router, Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import type { Equipment } from '../types/equipment';
import { nanoid } from 'nanoid';
import type {
  EquipmentControl,
  MachineControlKind,
  MachineExtra,
  MachineExtraKind,
  MachineInterlock,
  MachineMeterRef,
  MachineShutdown,
} from '../types/machine';
import type { ShellyComponentKind } from '../types/shelly';
import { findShellyDevice, isEquipmentReleased } from '../machines/machineControl';
import { DEFAULT_WATCHDOG_MINUTES } from '../machines/timing';

// Which Shelly output powers a machine. Mounted at /api/equipment next to equipmentRoutes,
// so the admin check is per route (the equipment list stays readable for everyone).

const router = Router();

const MAX_WATCHDOG_MINUTES = 60;
const CONTROL_KINDS: MachineControlKind[] = ['switch', 'light'];
const METER_KINDS: ShellyComponentKind[] = ['switch', 'light', 'cover', 'meter'];

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const parseShutdown = (raw: unknown): Parsed<MachineShutdown> => {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  if (value.mode === 'immediate') {
    return { ok: true, value: { mode: 'immediate' } };
  }
  if (value.mode !== 'when-idle') {
    return { ok: false, error: 'Unbekannter Abschaltmodus' };
  }
  const { idleThresholdW, idleSeconds, maxWaitMinutes } = value;
  if (
    typeof idleThresholdW !== 'number' ||
    !Number.isFinite(idleThresholdW) ||
    idleThresholdW <= 0 ||
    idleThresholdW > 100_000
  ) {
    return { ok: false, error: 'Leerlauf-Schwelle muss zwischen 0 und 100000 W liegen' };
  }
  if (!isInt(idleSeconds, 1, 3600)) {
    return { ok: false, error: 'Leerlauf-Dauer muss zwischen 1 und 3600 Sekunden liegen' };
  }
  if (!isInt(maxWaitMinutes, 1, 24 * 60)) {
    return { ok: false, error: 'Maximale Wartezeit muss zwischen 1 und 1440 Minuten liegen' };
  }
  return { ok: true, value: { mode: 'when-idle', idleThresholdW, idleSeconds, maxWaitMinutes } };
};

const EXTRA_KINDS: MachineExtraKind[] = ['switch', 'light', 'cover'];
const MAX_LABEL_LENGTH = 60;
const MAX_ITEMS = 10;

const readLabel = (value: unknown): string | null => {
  const label = typeof value === 'string' ? value.trim() : '';
  return label && label.length <= MAX_LABEL_LENGTH ? label : null;
};

const parseInterlocks = (raw: unknown): Parsed<MachineInterlock[]> => {
  if (raw === undefined || raw === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) {
    return { ok: false, error: `Höchstens ${MAX_ITEMS} Sicherheits-Eingänge` };
  }
  const result: MachineInterlock[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const label = readLabel(item?.label);
    if (!label) {
      return { ok: false, error: `Bezeichnung des Eingangs: 1–${MAX_LABEL_LENGTH} Zeichen` };
    }
    if (typeof item.deviceId !== 'string' || !isInt(item.index, 0, 64)) {
      return { ok: false, error: `Eingang „${label}“ ist ungültig` };
    }
    if (item.okWhen !== 'closed' && item.okWhen !== 'open') {
      return { ok: false, error: `Sicherer Zustand für „${label}“ fehlt` };
    }
    result.push({ deviceId: item.deviceId, index: item.index, label, okWhen: item.okWhen });
  }
  return { ok: true, value: result };
};

const parseExtras = (raw: unknown): Parsed<MachineExtra[]> => {
  if (raw === undefined || raw === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) {
    return { ok: false, error: `Höchstens ${MAX_ITEMS} Zusatzfunktionen` };
  }
  const result: MachineExtra[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const label = readLabel(item?.label);
    if (!label) {
      return { ok: false, error: `Bezeichnung der Zusatzfunktion: 1–${MAX_LABEL_LENGTH} Zeichen` };
    }
    const kind = item.kind as MachineExtraKind;
    if (
      typeof item.deviceId !== 'string' ||
      !EXTRA_KINDS.includes(kind) ||
      !isInt(item.index, 0, 64)
    ) {
      return { ok: false, error: `Zusatzfunktion „${label}“ ist ungültig` };
    }
    result.push({
      id: typeof item.id === 'string' && item.id ? item.id : nanoid(8),
      label,
      deviceId: item.deviceId,
      kind,
      index: item.index,
      offWithMachine: item.offWithMachine === true && kind !== 'cover',
    });
  }
  return { ok: true, value: result };
};

const parseMeter = (raw: unknown): Parsed<MachineMeterRef | null> => {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  const value = (typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = value.kind as ShellyComponentKind;
  if (typeof value.deviceId !== 'string' || !value.deviceId) {
    return { ok: false, error: 'Messgerät ist ungültig' };
  }
  if (!METER_KINDS.includes(kind) || !isInt(value.index, 0, 64)) {
    return { ok: false, error: 'Messkanal ist ungültig' };
  }
  return { ok: true, value: { deviceId: value.deviceId, kind, index: value.index } };
};

type StoredEquipment = Equipment & { _id: string; _rev: string };

const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.get('x-user-role') !== 'admin') {
    res.status(403).json({ error: 'Nur Admins dürfen die Maschinensteuerung ändern' });
    return;
  }
  next();
};

const findEquipmentDoc = async (id: string): Promise<StoredEquipment | null> => {
  const db = getDatabase<Equipment>();
  const result = await db.find({
    selector: { type: { $eq: 'equipment' }, id: { $eq: id } },
    limit: 1,
  });
  const doc = result.docs[0] as StoredEquipment | undefined;
  return doc && doc.isActive !== false ? doc : null;
};

/**
 * PUT /api/equipment/:id/control { deviceId, kind, index, watchdogMinutes? }
 */
router.put('/:id/control', requireAdmin, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const kind = body.kind as MachineControlKind;
  const index = body.index;
  const watchdogMinutes =
    body.watchdogMinutes === undefined ? DEFAULT_WATCHDOG_MINUTES : body.watchdogMinutes;

  if (!deviceId) {
    res.status(400).json({ error: 'Shelly-Gerät ist erforderlich' });
    return;
  }
  if (!CONTROL_KINDS.includes(kind)) {
    res.status(400).json({ error: 'Nur ein Relais oder Licht kann eine Maschine schalten' });
    return;
  }
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    res.status(400).json({ error: 'Ungültiger Kanal' });
    return;
  }
  if (
    typeof watchdogMinutes !== 'number' ||
    !Number.isInteger(watchdogMinutes) ||
    watchdogMinutes < 1 ||
    watchdogMinutes > MAX_WATCHDOG_MINUTES
  ) {
    res.status(400).json({
      error: `Sicherheits-Timer muss zwischen 1 und ${MAX_WATCHDOG_MINUTES} Minuten liegen`,
    });
    return;
  }

  try {
    const equipment = await findEquipmentDoc(req.params.id);
    if (!equipment) {
      res.status(404).json({ error: 'Ausstattung nicht gefunden' });
      return;
    }
    if (isEquipmentReleased(equipment.id)) {
      res.status(409).json({ error: 'Die Maschine ist gerade freigegeben' });
      return;
    }

    const device = await findShellyDevice(deviceId);
    if (!device) {
      res.status(400).json({ error: 'Shelly-Gerät nicht gefunden' });
      return;
    }
    if (!device.components.some((c) => c.kind === kind && c.index === index)) {
      res.status(400).json({ error: 'Dieser Kanal existiert auf dem Gerät nicht' });
      return;
    }

    // One output can power only one machine.
    const db = getDatabase<Equipment>();
    const others = await db.find({
      selector: { type: { $eq: 'equipment' }, 'control.deviceId': { $eq: deviceId } },
      limit: 1000,
    });
    const taken = others.docs.find(
      (e) =>
        e.id !== equipment.id &&
        e.isActive !== false &&
        e.control?.kind === kind &&
        e.control.index === index
    );
    if (taken) {
      res.status(409).json({ error: `Dieser Kanal schaltet bereits „${taken.name}“` });
      return;
    }

    const shutdownInput =
      body.shutdown === undefined
        ? {
            ok: true as const,
            value: equipment.control?.shutdown ?? { mode: 'immediate' as const },
          }
        : parseShutdown(body.shutdown);
    if (!shutdownInput.ok) {
      res.status(400).json({ error: shutdownInput.error });
      return;
    }
    const meterInput = parseMeter(body.meter);
    if (!meterInput.ok) {
      res.status(400).json({ error: meterInput.error });
      return;
    }

    // The meter must exist and measure power.
    const meter = meterInput.value;
    if (meter) {
      const meterDevice =
        meter.deviceId === device.id ? device : await findShellyDevice(meter.deviceId);
      const component = meterDevice?.components.find(
        (c) => c.kind === meter.kind && c.index === meter.index
      );
      if (!component || (component.kind !== 'meter' && !component.hasPowerMeter)) {
        res.status(400).json({ error: 'Dieser Kanal misst keine Leistung' });
        return;
      }
    }

    const interlocksInput = parseInterlocks(body.interlocks);
    if (!interlocksInput.ok) {
      res.status(400).json({ error: interlocksInput.error });
      return;
    }
    const extrasInput = parseExtras(body.extras);
    if (!extrasInput.ok) {
      res.status(400).json({ error: extrasInput.error });
      return;
    }

    // Every referenced component must exist with the right kind, and nothing may reuse the
    // machine's own power output.
    const deviceCache = new Map<string, Awaited<ReturnType<typeof findShellyDevice>>>([
      [device.id, device],
    ]);
    const lookup = async (id: string): Promise<Awaited<ReturnType<typeof findShellyDevice>>> => {
      if (!deviceCache.has(id)) {
        deviceCache.set(id, await findShellyDevice(id));
      }
      return deviceCache.get(id) ?? null;
    };
    for (const interlock of interlocksInput.value) {
      const d = await lookup(interlock.deviceId);
      if (!d?.components.some((c) => c.kind === 'input' && c.index === interlock.index)) {
        res.status(400).json({ error: `„${interlock.label}“ ist kein Eingang dieses Geräts` });
        return;
      }
    }
    for (const extra of extrasInput.value) {
      const d = await lookup(extra.deviceId);
      if (!d?.components.some((c) => c.kind === extra.kind && c.index === extra.index)) {
        res.status(400).json({ error: `„${extra.label}“: Kanal existiert auf dem Gerät nicht` });
        return;
      }
      if (extra.deviceId === deviceId && extra.kind === kind && extra.index === index) {
        res.status(400).json({
          error: `„${extra.label}“ ist der Hauptschalter der Maschine und kann keine Zusatzfunktion sein`,
        });
        return;
      }
    }

    // "When idle" needs to know the power.
    const outputMeasures = device.components.some(
      (c) => c.kind === kind && c.index === index && c.hasPowerMeter
    );
    if (shutdownInput.value.mode === 'when-idle' && !meter && !outputMeasures) {
      res.status(400).json({
        error: 'Abschalten im Leerlauf braucht eine Leistungsmessung (Ausgang oder Messgerät)',
      });
      return;
    }

    const control: EquipmentControl = {
      deviceId,
      kind,
      index,
      watchdogMinutes,
      shutdown: shutdownInput.value,
      ...(meter ? { meter } : {}),
      ...(interlocksInput.value.length ? { interlocks: interlocksInput.value } : {}),
      ...(extrasInput.value.length ? { extras: extrasInput.value } : {}),
    };
    const updated: StoredEquipment = {
      ...equipment,
      control,
      updatedAt: new Date().toISOString(),
    };
    const result = await db.insert(updated);

    void logAuditEvent(
      {
        action: 'equipment.control.update',
        targetType: 'equipment',
        targetId: equipment.id,
        relatedId: deviceId,
      },
      req
    );
    res.json({ ...updated, _rev: result.rev });
  } catch (err) {
    console.error('[machine-routes] Error saving control:', err);
    res.status(500).json({ error: 'Steuerung konnte nicht gespeichert werden' });
  }
});

/**
 * DELETE /api/equipment/:id/control
 */
router.delete('/:id/control', requireAdmin, async (req: Request, res: Response) => {
  try {
    const equipment = await findEquipmentDoc(req.params.id);
    if (!equipment) {
      res.status(404).json({ error: 'Ausstattung nicht gefunden' });
      return;
    }
    if (isEquipmentReleased(equipment.id)) {
      res.status(409).json({ error: 'Die Maschine ist gerade freigegeben' });
      return;
    }

    const { control: _control, ...rest } = equipment;
    const updated: StoredEquipment = { ...rest, updatedAt: new Date().toISOString() };
    const result = await getDatabase<Equipment>().insert(updated);

    void logAuditEvent(
      { action: 'equipment.control.remove', targetType: 'equipment', targetId: equipment.id },
      req
    );
    res.json({ ...updated, _rev: result.rev });
  } catch (err) {
    console.error('[machine-routes] Error removing control:', err);
    res.status(500).json({ error: 'Steuerung konnte nicht entfernt werden' });
  }
});

export default router;
