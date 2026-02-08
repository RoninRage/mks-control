import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import { Equipment, EquipmentWithMeta } from '../types/equipment';
import { Member } from '../types/member';

const router = Router();

const normalizeName = (value: string): string => value.trim().toLowerCase();

/**
 * GET /api/equipment
 * Get all equipment
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase<Equipment>();
    const result = await db.find({
      selector: {
        type: { $eq: 'equipment' },
        $or: [{ isActive: { $eq: true } }, { isActive: { $exists: false } }],
      },
    });
    const equipment: EquipmentWithMeta[] = result.docs as EquipmentWithMeta[];
    res.json(equipment);
  } catch (error) {
    console.error('[equipment-routes] Error fetching equipment:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

/**
 * GET /api/equipment/:id
 * Get a specific equipment item by id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase<Equipment>();
    const result = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'equipment' } },
      limit: 1,
    });

    if (result.docs.length === 0) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    res.json(result.docs[0]);
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ error: 'Equipment not found' });
    } else {
      console.error('[equipment-routes] Error fetching equipment:', error);
      res.status(500).json({ error: 'Failed to fetch equipment' });
    }
  }
});

/**
 * POST /api/equipment
 * Create a new equipment item
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, areaId, isAvailable, configuration } = req.body as Equipment;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const normalizedName = normalizeName(name);

    if (!normalizedName) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (configuration && configuration.length > 4096) {
      res.status(400).json({ error: 'Configuration must be 4096 characters or fewer' });
      return;
    }

    const db = getDatabase<Equipment>();
    const existingByName = await db.find({
      selector: { type: { $eq: 'equipment' } },
    });

    const duplicate = existingByName.docs.find(
      (equipment) => normalizeName(equipment.name) === normalizedName
    );

    if (duplicate) {
      res.status(409).json({ error: 'Equipment name already exists' });
      return;
    }

    const now = new Date().toISOString();
    const newEquipment: Equipment = {
      type: 'equipment',
      id: Date.now().toString(),
      name: name.trim(),
      configuration: configuration || '',
      areaId: areaId || '',
      isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.insert(newEquipment);

    void logAuditEvent(
      {
        action: 'equipment.create',
        targetType: 'equipment',
        targetId: newEquipment.id,
      },
      req
    );

    res.status(201).json({
      ...newEquipment,
      _id: result.id,
      _rev: result.rev,
    });
  } catch (error) {
    console.error('[equipment-routes] Error creating equipment:', error);
    res.status(500).json({ error: 'Failed to create equipment' });
  }
});

/**
 * PUT /api/equipment/:id
 * Update an equipment item
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, areaId, isAvailable, configuration } = req.body as Equipment;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const normalizedName = normalizeName(name);

    if (!normalizedName) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (configuration && configuration.length > 4096) {
      res.status(400).json({ error: 'Configuration must be 4096 characters or fewer' });
      return;
    }

    const db = getDatabase<Equipment>();
    const existingResult = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'equipment' } },
      limit: 1,
    });

    if (existingResult.docs.length === 0) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    const existingEquipment = existingResult.docs[0];

    const existingByName = await db.find({
      selector: { type: { $eq: 'equipment' } },
    });

    const duplicate = existingByName.docs.find(
      (equipment) =>
        equipment.id !== existingEquipment.id && normalizeName(equipment.name) === normalizedName
    );

    if (duplicate) {
      res.status(409).json({ error: 'Equipment name already exists' });
      return;
    }

    const now = new Date().toISOString();
    const updatedEquipment: EquipmentWithMeta = {
      ...existingEquipment,
      type: 'equipment',
      name: name.trim(),
      configuration: configuration || '',
      areaId: areaId || '',
      isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
      isActive: existingEquipment.isActive ?? true,
      deletedAt: existingEquipment.deletedAt,
      createdAt: existingEquipment.createdAt ?? now,
      updatedAt: now,
    };

    const result = await db.insert(updatedEquipment);

    void logAuditEvent(
      {
        action: 'equipment.update',
        targetType: 'equipment',
        targetId: existingEquipment.id,
      },
      req
    );

    res.json({
      ...updatedEquipment,
      _rev: result.rev,
    });
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ error: 'Equipment not found' });
    } else {
      console.error('[equipment-routes] Error updating equipment:', error);
      res.status(500).json({ error: 'Failed to update equipment' });
    }
  }
});

/**
 * DELETE /api/equipment/:id
 * Delete an equipment item
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase<Equipment>();
    const result = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'equipment' } },
      limit: 1,
    });

    if (result.docs.length === 0) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    const equipment = result.docs[0];

    const membersDb = getDatabase<Member>();
    const membersResult = await membersDb.find({
      selector: {
        roles: { $exists: true },
        $or: [{ isActive: { $eq: true } }, { isActive: { $exists: false } }],
      },
    });

    const hasActiveAssignments = membersResult.docs.some((member: Member) => {
      return Boolean(member.equipmentPermissions?.[equipment.id]);
    });

    if (hasActiveAssignments) {
      res.status(409).json({ error: 'Ausruestung ist Mitgliedern zugewiesen' });
      return;
    }

    const now = new Date().toISOString();
    equipment.isActive = false;
    equipment.deletedAt = now;
    equipment.updatedAt = now;
    await db.insert(equipment);

    void logAuditEvent(
      {
        action: 'equipment.deactivate',
        targetType: 'equipment',
        targetId: equipment.id,
      },
      req
    );

    res.json({ success: true });
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ error: 'Equipment not found' });
    } else {
      console.error('[equipment-routes] Error deleting equipment:', error);
      res.status(500).json({ error: 'Failed to delete equipment' });
    }
  }
});

export default router;
