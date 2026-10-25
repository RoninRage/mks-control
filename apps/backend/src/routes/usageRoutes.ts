import { Router, Request, Response } from 'express';
import { getDatabase, getUsageDatabase } from '../db/couchdb';
import type { Area } from '../types/area';
import type { Equipment } from '../types/equipment';
import type { EquipmentUsage, EquipmentUsageView, UsageListResponse } from '../types/machine';

// Machine usages (releases). Mounted at /api/usage.
// Visibility follows the existing roles, like the audit log:
//   admin, vorstand  → all usages
//   bereichsleitung  → usages of equipment in their own areas, plus their own
//   mitglied         → only their own
// As elsewhere outside the terminals, role and user come from the client's headers.

const router = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

type Selector = Record<string, unknown>;

const parseDate = (value: unknown, endOfDay: boolean): string | null => {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  // Plain dates ("2026-10-24") cover the whole day.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

const equipmentInOwnAreas = async (userId: string): Promise<string[]> => {
  const db = getDatabase<Area | Equipment>();
  const areas = await db.find({ selector: { type: { $eq: 'area' } }, limit: 1000 });
  const areaIds = (areas.docs as Area[])
    .filter((a) => a.bereichsleiterIds?.includes(userId))
    .map((a) => a.id);
  if (areaIds.length === 0) {
    return [];
  }
  const equipment = await db.find({
    selector: { type: { $eq: 'equipment' }, areaId: { $in: areaIds } },
    limit: 5000,
  });
  return (equipment.docs as Equipment[]).map((e) => e.id);
};

/**
 * GET /api/usage?equipmentId=&memberId=&from=&to=&limit=
 */
router.get('/', async (req: Request, res: Response) => {
  const role = req.get('x-user-role') ?? '';
  const userId = req.get('x-user-id') ?? '';
  if (!role) {
    res.status(403).json({ error: 'Nicht angemeldet' });
    return;
  }
  const seesAll = role === 'admin' || role === 'vorstand';
  if (!seesAll && !userId) {
    res.status(403).json({ error: 'Nicht angemeldet' });
    return;
  }

  const query = req.query as Record<string, unknown>;
  const from = parseDate(query.from, false);
  const to = parseDate(query.to, true);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));

  const conditions: Selector[] = [
    { type: { $eq: 'equipmentUsage' } },
    { startedAt: from ? { $gte: from } : { $gt: null } },
  ];
  if (to) {
    conditions.push({ startedAt: { $lte: to } });
  }
  if (typeof query.equipmentId === 'string' && query.equipmentId) {
    conditions.push({ equipmentId: { $eq: query.equipmentId } });
  }
  if (typeof query.memberId === 'string' && query.memberId) {
    conditions.push({ memberId: { $eq: query.memberId } });
  }

  try {
    if (role === 'bereichsleitung') {
      const ownEquipment = await equipmentInOwnAreas(userId);
      conditions.push({
        $or: [{ memberId: { $eq: userId } }, { equipmentId: { $in: ownEquipment } }],
      });
    } else if (!seesAll) {
      conditions.push({ memberId: { $eq: userId } });
    }

    const result = await getUsageDatabase().find({
      selector: { $and: conditions },
      sort: [{ startedAt: 'desc' }],
      limit,
    });

    const equipment = await getDatabase<Equipment>().find({
      selector: { type: { $eq: 'equipment' } },
      fields: ['id', 'name'],
      limit: 5000,
    });
    const names = new Map(
      (equipment.docs as Pick<Equipment, 'id' | 'name'>[]).map((e) => [e.id, e.name])
    );

    const now = Date.now();
    const usages: EquipmentUsageView[] = (result.docs as EquipmentUsage[]).map((usage) => {
      // Internal bookkeeping fields stay in the database.
      const {
        _id: _docId,
        _rev: _docRev,
        startEnergyWh: _startEnergyWh,
        shutdownRequestedAt: _shutdownRequestedAt,
        shutdownReason: _shutdownReason,
        ...rest
      } = usage;
      return {
        ...rest,
        // Running usages: duration so far.
        durationSec:
          usage.durationSec ?? Math.max(0, Math.round((now - Date.parse(usage.startedAt)) / 1000)),
        equipmentName: names.get(usage.equipmentId) ?? 'Unbekannte Ausstattung',
      };
    });

    const response: UsageListResponse = {
      usages,
      totals: {
        count: usages.length,
        durationSec: usages.reduce((sum, u) => sum + (u.durationSec ?? 0), 0),
        energyWh: Math.round(usages.reduce((sum, u) => sum + (u.energyWh ?? 0), 0) * 100) / 100,
      },
    };
    res.json(response);
  } catch (err) {
    console.error('[usage-routes] Error listing usages:', err);
    res.status(500).json({ error: 'Nutzungen konnten nicht geladen werden' });
  }
});

export default router;
