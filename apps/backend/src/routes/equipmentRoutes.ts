import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/couchdb';
import { Equipment, EquipmentWithMeta } from '../types/equipment';

const router = Router();

/**
 * GET /api/equipment
 * Get all equipment
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase<EquipmentWithMeta>();
    const result = await db.find({
      selector: { type: { $eq: 'equipment' } },
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
    const db = getDatabase<EquipmentWithMeta>();
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

    if (configuration && configuration.length > 4096) {
      res.status(400).json({ error: 'Configuration must be 4096 characters or fewer' });
      return;
    }

    const newEquipment: Equipment = {
      type: 'equipment',
      id: Date.now().toString(),
      name,
      configuration: configuration || '',
      areaId: areaId || '',
      isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
    };

    const db = getDatabase<Equipment>();
    const result = await db.insert(newEquipment);

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

    if (configuration && configuration.length > 4096) {
      res.status(400).json({ error: 'Configuration must be 4096 characters or fewer' });
      return;
    }

    const db = getDatabase<EquipmentWithMeta>();
    const existingResult = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'equipment' } },
      limit: 1,
    });

    if (existingResult.docs.length === 0) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    const existingEquipment = existingResult.docs[0];

    const updatedEquipment: EquipmentWithMeta = {
      ...existingEquipment,
      type: 'equipment',
      name,
      configuration: configuration || '',
      areaId: areaId || '',
      isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
    };

    const result = await db.insert(updatedEquipment);

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
    const db = getDatabase<EquipmentWithMeta>();
    const result = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'equipment' } },
      limit: 1,
    });

    if (result.docs.length === 0) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    const equipment = result.docs[0];
    await db.destroy(equipment._id, equipment._rev);
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
