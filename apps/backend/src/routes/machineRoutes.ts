import { Router, Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import type { Equipment } from '../types/equipment';
import type { EquipmentControl, MachineControlKind } from '../types/machine';
import { findShellyDevice, isEquipmentReleased } from '../machines/machineControl';
import { DEFAULT_WATCHDOG_MINUTES } from '../machines/timing';

// Which Shelly output powers a machine. Mounted at /api/equipment next to equipmentRoutes,
// so the admin check is per route (the equipment list stays readable for everyone).

const router = Router();

const MAX_WATCHDOG_MINUTES = 60;
const CONTROL_KINDS: MachineControlKind[] = ['switch', 'light'];

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

    const control: EquipmentControl = {
      deviceId,
      kind,
      index,
      watchdogMinutes,
      shutdown: { mode: 'immediate' },
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
