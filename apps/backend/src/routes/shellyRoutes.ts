import { Router, Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import type {
  ShellyComponent,
  ShellyDevice,
  ShellyDeviceStatus,
  ShellyProbeResult,
} from '../types/shelly';
import { getDriver, probeShelly } from '../shelly/driver';
import {
  ShellyAuthError,
  ShellyError,
  ShellyProtocolError,
  ShellyUnreachableError,
  ShellyUnsupportedError,
} from '../shelly/errors';
import { normalizeShellyHost } from '../shelly/host';
import { isDeviceInUse } from '../machines/machineControl';
import type { Equipment } from '../types/equipment';

// Shelly device management (admin only).
// Mounted at /api/shelly.

const router = Router();

const MAX_NAME_LENGTH = 100;
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;
const INVALID_HOST_MESSAGE =
  'Ungültige Adresse. Erlaubt ist eine IPv4-Adresse im lokalen Netz, z. B. 192.168.1.50';

type StoredShellyDevice = ShellyDevice & { _id: string; _rev: string };

const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.get('x-user-role') !== 'admin') {
    res.status(403).json({ error: 'Nur Admins dürfen Shelly-Geräte verwalten' });
    return;
  }
  next();
};

router.use(requireAdmin);

const sendShellyError = (res: Response, err: unknown, context: string): void => {
  if (err instanceof ShellyUnsupportedError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (
    err instanceof ShellyUnreachableError ||
    err instanceof ShellyAuthError ||
    err instanceof ShellyProtocolError ||
    err instanceof ShellyError
  ) {
    res.status(502).json({ error: err.message });
    return;
  }
  console.error(`[shelly-routes] ${context}:`, err);
  res.status(500).json({ error: 'Interner Fehler' });
};

// The webhook key stays on the server.
const toPublicDevice = (device: StoredShellyDevice): Omit<StoredShellyDevice, 'eventKey'> => {
  const { eventKey: _eventKey, ...rest } = device;
  return rest;
};

const readName = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    return null;
  }
  return trimmed;
};

const findDeviceById = async (id: string): Promise<StoredShellyDevice | null> => {
  const db = getDatabase<ShellyDevice>();
  const result = await db.find({
    selector: { type: { $eq: 'shellyDevice' }, id: { $eq: id }, isActive: { $eq: true } },
    limit: 1,
  });
  return (result.docs[0] as StoredShellyDevice | undefined) ?? null;
};

const findDeviceByMac = async (mac: string): Promise<StoredShellyDevice | null> => {
  const db = getDatabase<ShellyDevice>();
  const result = await db.find({
    selector: { type: { $eq: 'shellyDevice' }, mac: { $eq: mac } },
    limit: 10,
  });
  const docs = result.docs as StoredShellyDevice[];
  // Prefer an active entry; otherwise return a retired one so it can be reactivated.
  return docs.find((doc) => doc.isActive) ?? docs[0] ?? null;
};

// The health monitor and webhook setup also write device docs. On a conflict, our change wins
// but fields only they maintain (eventKey, push) are taken from the latest version.
const saveDevice = async (device: StoredShellyDevice): Promise<StoredShellyDevice> => {
  const db = getDatabase<ShellyDevice>();
  let next = device;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await db.insert(next);
      return { ...next, _rev: result.rev };
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409 || attempt === 2) {
        throw err;
      }
      const latest = (await db.get(device._id)) as StoredShellyDevice;
      next = { ...next, _rev: latest._rev, eventKey: latest.eventKey, push: latest.push };
    }
  }
  return next;
};

const applyProbe = (
  device: StoredShellyDevice,
  probe: ShellyProbeResult,
  now: string
): StoredShellyDevice => ({
  ...device,
  shellyId: probe.shellyId,
  model: probe.model,
  gen: probe.gen,
  host: probe.host,
  firmware: probe.firmware,
  components: probe.components,
  health: 'online',
  lastSeenAt: now,
  updatedAt: now,
});

const pickIdentifyComponent = (components: ShellyComponent[]): ShellyComponent | undefined =>
  components.find((c) => c.kind === 'switch') ?? components.find((c) => c.kind === 'light');

/**
 * GET /api/shelly/devices
 * All active devices, sorted by name.
 */
router.get('/devices', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase<ShellyDevice>();
    const result = await db.find({
      selector: { type: { $eq: 'shellyDevice' }, isActive: { $eq: true } },
      limit: 1000,
    });
    const devices = (result.docs as StoredShellyDevice[]).sort((a, b) =>
      a.name.localeCompare(b.name, 'de')
    );
    res.json(devices.map(toPublicDevice));
  } catch (err) {
    sendShellyError(res, err, 'Error listing devices');
  }
});

/**
 * POST /api/shelly/devices/probe { host }
 * Checks a host without saving anything. Used by the "add device" dialog.
 */
router.post('/devices/probe', async (req: Request, res: Response) => {
  const host = normalizeShellyHost((req.body as { host?: unknown }).host);
  if (!host) {
    res.status(400).json({ error: INVALID_HOST_MESSAGE });
    return;
  }

  try {
    const probe = await probeShelly(host);
    const existing = await findDeviceByMac(probe.mac);
    res.json({
      ...probe,
      existingDeviceId: existing?.isActive ? existing.id : undefined,
    });
  } catch (err) {
    sendShellyError(res, err, 'Error probing device');
  }
});

/**
 * POST /api/shelly/devices { host, name? }
 * Probes the host and stores the device. A retired device with the same MAC is reactivated.
 */
router.post('/devices', async (req: Request, res: Response) => {
  const body = req.body as { host?: unknown; name?: unknown };
  const host = normalizeShellyHost(body.host);
  if (!host) {
    res.status(400).json({ error: INVALID_HOST_MESSAGE });
    return;
  }
  const name = readName(body.name);
  if (name === null) {
    res.status(400).json({ error: `Name muss 1–${MAX_NAME_LENGTH} Zeichen lang sein` });
    return;
  }

  try {
    const probe = await probeShelly(host);
    const existing = await findDeviceByMac(probe.mac);
    if (existing?.isActive) {
      res.status(409).json({ error: 'Dieses Gerät ist bereits angelegt', deviceId: existing.id });
      return;
    }

    const now = new Date().toISOString();
    const deviceName = name ?? probe.name ?? probe.shellyId;
    let saved: StoredShellyDevice;

    if (existing) {
      saved = await saveDevice({
        ...applyProbe(existing, probe, now),
        name: name ?? existing.name,
        isActive: true,
        deletedAt: undefined,
      });
    } else {
      const db = getDatabase<ShellyDevice>();
      const device: ShellyDevice = {
        type: 'shellyDevice',
        id: nanoid(),
        shellyId: probe.shellyId,
        mac: probe.mac,
        model: probe.model,
        gen: probe.gen,
        host: probe.host,
        name: deviceName,
        firmware: probe.firmware,
        components: probe.components,
        health: 'online',
        lastSeenAt: now,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.insert(device);
      saved = { ...device, _id: result.id, _rev: result.rev };
    }

    void logAuditEvent(
      { action: 'shelly.device.create', targetType: 'shellyDevice', targetId: saved.id },
      req
    );
    res.status(201).json(toPublicDevice(saved));
  } catch (err) {
    sendShellyError(res, err, 'Error creating device');
  }
});

/**
 * PUT /api/shelly/devices/:id { name?, host? }
 * A new host is probed and must answer with the same MAC.
 */
router.put('/devices/:id', async (req: Request, res: Response) => {
  const body = req.body as { host?: unknown; name?: unknown };
  const name = readName(body.name);
  if (name === null) {
    res.status(400).json({ error: `Name muss 1–${MAX_NAME_LENGTH} Zeichen lang sein` });
    return;
  }
  let host: string | undefined;
  if (body.host !== undefined) {
    const normalized = normalizeShellyHost(body.host);
    if (!normalized) {
      res.status(400).json({ error: INVALID_HOST_MESSAGE });
      return;
    }
    host = normalized;
  }

  try {
    const device = await findDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Gerät nicht gefunden' });
      return;
    }

    const now = new Date().toISOString();
    let updated: StoredShellyDevice = { ...device, updatedAt: now };
    if (name !== undefined) {
      updated.name = name;
    }
    if (host !== undefined && host !== device.host) {
      const probe = await probeShelly(host);
      if (probe.mac !== device.mac) {
        res.status(409).json({ error: 'Unter dieser Adresse antwortet ein anderes Gerät' });
        return;
      }
      updated = applyProbe(updated, probe, now);
    }

    const saved = await saveDevice(updated);
    void logAuditEvent(
      { action: 'shelly.device.update', targetType: 'shellyDevice', targetId: saved.id },
      req
    );
    res.json(toPublicDevice(saved));
  } catch (err) {
    sendShellyError(res, err, 'Error updating device');
  }
});

/**
 * POST /api/shelly/devices/:id/refresh
 * Reads model, firmware and components from the device again.
 */
router.post('/devices/:id/refresh', async (req: Request, res: Response) => {
  try {
    const device = await findDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Gerät nicht gefunden' });
      return;
    }

    const probe = await probeShelly(device.host);
    if (probe.mac !== device.mac) {
      res.status(409).json({ error: 'Unter dieser Adresse antwortet ein anderes Gerät' });
      return;
    }

    const saved = await saveDevice(applyProbe(device, probe, new Date().toISOString()));
    res.json(toPublicDevice(saved));
  } catch (err) {
    sendShellyError(res, err, 'Error refreshing device');
  }
});

/**
 * GET /api/shelly/devices/:id/status
 * Live state of all components. An unreachable device is reported with health "offline"
 * (HTTP 200), so the list can show it without treating it as a request error.
 */
router.get('/devices/:id/status', async (req: Request, res: Response) => {
  try {
    const device = await findDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Gerät nicht gefunden' });
      return;
    }

    const now = new Date();
    let status: ShellyDeviceStatus;
    try {
      const components = await getDriver(device.gen).getStatus(device.host, device.components);
      status = {
        deviceId: device.id,
        health: 'online',
        checkedAt: now.toISOString(),
        components,
      };
    } catch (err) {
      if (!(err instanceof ShellyError)) {
        throw err;
      }
      status = {
        deviceId: device.id,
        health: 'offline',
        checkedAt: now.toISOString(),
        components: [],
        error: err.message,
      };
    }

    // Persist health changes, and refresh lastSeenAt at most once a minute.
    const lastSeen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
    const shouldWrite =
      status.health !== device.health ||
      (status.health === 'online' && now.getTime() - lastSeen > LAST_SEEN_WRITE_INTERVAL_MS);
    if (shouldWrite) {
      try {
        await saveDevice({
          ...device,
          health: status.health,
          lastSeenAt: status.health === 'online' ? status.checkedAt : device.lastSeenAt,
        });
      } catch (err) {
        // A concurrent update wins; the next status call will write again.
        if ((err as { statusCode?: number }).statusCode !== 409) {
          throw err;
        }
      }
    }

    res.json(status);
  } catch (err) {
    sendShellyError(res, err, 'Error reading device status');
  }
});

/**
 * POST /api/shelly/devices/:id/identify
 * Flips the first relay (or light) for one second so the device can be found.
 * The device restores the previous state by itself.
 */
router.post('/devices/:id/identify', async (req: Request, res: Response) => {
  try {
    const device = await findDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Gerät nicht gefunden' });
      return;
    }

    // Flipping the output would switch a released machine off for a second.
    if (isDeviceInUse(device.id)) {
      throw new ShellyUnsupportedError('Das Gerät schaltet gerade eine freigegebene Maschine');
    }

    const component = pickIdentifyComponent(device.components);
    if (!component) {
      throw new ShellyUnsupportedError(
        'Dieses Gerät hat kein Relais und kein Licht zum Identifizieren'
      );
    }

    const driver = getDriver(device.gen);
    const statuses = await driver.getStatus(device.host, device.components);
    const current = statuses.find((s) => s.kind === component.kind && s.index === component.index);
    const target = !(current?.on ?? false);

    if (component.kind === 'switch') {
      await driver.setSwitch(device.host, component.index, target, 1);
    } else {
      await driver.setLight(device.host, component.index, target, undefined, 1);
    }

    void logAuditEvent(
      { action: 'shelly.device.identify', targetType: 'shellyDevice', targetId: device.id },
      req
    );
    res.json({ success: true, kind: component.kind, index: component.index });
  } catch (err) {
    sendShellyError(res, err, 'Error identifying device');
  }
});

/**
 * DELETE /api/shelly/devices/:id
 * Retires the device (soft delete). Adding the same device again reactivates it.
 */
router.delete('/devices/:id', async (req: Request, res: Response) => {
  try {
    const device = await findDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Gerät nicht gefunden' });
      return;
    }

    const assigned = await getDatabase<Equipment>().find({
      selector: {
        type: { $eq: 'equipment' },
        $or: [
          { 'control.deviceId': { $eq: device.id } },
          { 'control.meter.deviceId': { $eq: device.id } },
          { 'control.interlocks': { $elemMatch: { deviceId: { $eq: device.id } } } },
          { 'control.extras': { $elemMatch: { deviceId: { $eq: device.id } } } },
        ],
      },
      limit: 1000,
    });
    const machine = assigned.docs.find((e) => e.isActive !== false);
    if (machine) {
      res.status(409).json({
        error: `Das Gerät schaltet „${machine.name}“. Bitte zuerst die Zuordnung entfernen.`,
      });
      return;
    }

    const now = new Date().toISOString();
    await saveDevice({ ...device, isActive: false, deletedAt: now, updatedAt: now });

    void logAuditEvent(
      { action: 'shelly.device.retire', targetType: 'shellyDevice', targetId: device.id },
      req
    );
    res.json({ success: true });
  } catch (err) {
    sendShellyError(res, err, 'Error retiring device');
  }
});

export default router;
