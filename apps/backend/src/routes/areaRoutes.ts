import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';
import { Area, AreaWithMeta } from '../types/area';

const router = Router();

const normalizeName = (value: string): string => value.trim().toLowerCase();

/**
 * GET /api/areas
 * Get all areas
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase<Area>();
    const result = await db.find({
      selector: { type: { $eq: 'area' } },
    });
    const areas: AreaWithMeta[] = result.docs as AreaWithMeta[];
    res.json(areas);
  } catch (error) {
    console.error('[area-routes] Error fetching areas:', error);
    res.status(500).json({ error: 'Failed to fetch areas' });
  }
});

/**
 * GET /api/areas/:id
 * Get a specific area by id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase<Area>();
    const result = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'area' } },
      limit: 1,
    });

    if (result.docs.length === 0) {
      res.status(404).json({ error: 'Area not found' });
      return;
    }

    res.json(result.docs[0]);
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ error: 'Area not found' });
    } else {
      console.error('[area-routes] Error fetching area:', error);
      res.status(500).json({ error: 'Failed to fetch area' });
    }
  }
});

/**
 * POST /api/areas
 * Create a new area
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, bereichsleiterIds } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const normalizedName = normalizeName(name);

    if (!normalizedName) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const db = getDatabase<Area>();
    const existingByName = await db.find({
      selector: { type: { $eq: 'area' } },
    });

    const duplicate = existingByName.docs.find(
      (area) => normalizeName(area.name) === normalizedName
    );

    if (duplicate) {
      res.status(409).json({ error: 'Area name already exists' });
      return;
    }

    const now = new Date().toISOString();
    const newArea: Omit<Area, '_id' | '_rev'> = {
      type: 'area',
      id: Date.now().toString(),
      name: name.trim(),
      description: description || '',
      bereichsleiterIds: bereichsleiterIds || [],
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.insert(newArea);

    void logAuditEvent(
      {
        action: 'area.create',
        targetType: 'area',
        targetId: newArea.id,
      },
      req
    );

    res.status(201).json({
      ...newArea,
      _id: result.id,
      _rev: result.rev,
    });
  } catch (error) {
    console.error('[area-routes] Error creating area:', error);
    res.status(500).json({ error: 'Failed to create area' });
  }
});

/**
 * PUT /api/areas/:id
 * Update an area
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, bereichsleiterIds } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const normalizedName = normalizeName(name);

    if (!normalizedName) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const db = getDatabase<Area>();
    const existingResult = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'area' } },
      limit: 1,
    });

    if (existingResult.docs.length === 0) {
      res.status(404).json({ error: 'Area not found' });
      return;
    }

    const existingArea = existingResult.docs[0];

    const existingByName = await db.find({
      selector: { type: { $eq: 'area' } },
    });

    const duplicate = existingByName.docs.find(
      (area) => area.id !== existingArea.id && normalizeName(area.name) === normalizedName
    );

    if (duplicate) {
      res.status(409).json({ error: 'Area name already exists' });
      return;
    }

    const updatedArea: Area = {
      ...existingArea,
      type: 'area',
      name: name.trim(),
      description: description || '',
      bereichsleiterIds: bereichsleiterIds || existingArea.bereichsleiterIds || [],
      updatedAt: new Date().toISOString(),
    };

    const result = await db.insert(updatedArea);

    void logAuditEvent(
      {
        action: 'area.update',
        targetType: 'area',
        targetId: existingArea.id,
      },
      req
    );

    res.json({
      ...updatedArea,
      _rev: result.rev,
    });
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ error: 'Area not found' });
    } else {
      console.error('[area-routes] Error updating area:', error);
      res.status(500).json({ error: 'Failed to update area' });
    }
  }
});

/**
 * DELETE /api/areas/:id
 * Delete an area
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase<Area>();
    const result = await db.find({
      selector: { id: { $eq: req.params.id }, type: { $eq: 'area' } },
      limit: 1,
    });

    if (result.docs.length === 0) {
      res.status(404).json({ error: 'Area not found' });
      return;
    }

    const area = result.docs[0];
    await db.destroy(area._id, area._rev);

    void logAuditEvent(
      {
        action: 'area.delete',
        targetType: 'area',
        targetId: area.id,
      },
      req
    );

    res.json({ success: true });
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ error: 'Area not found' });
    } else {
      console.error('[area-routes] Error deleting area:', error);
      res.status(500).json({ error: 'Failed to delete area' });
    }
  }
});

export default router;
