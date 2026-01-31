import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/couchdb';
import { Area, AreaWithMeta } from '../types/area';

const router = Router();

/**
 * GET /api/areas
 * Get all areas
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase<AreaWithMeta>();
    const result = await db.find({
      selector: { name: { $gt: null }, description: { $gt: null } },
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
    const db = getDatabase<AreaWithMeta>();
    const result = await db.find({
      selector: { id: { $eq: req.params.id } },
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

    const newArea: Area = {
      id: Date.now().toString(),
      name,
      description: description || '',
      bereichsleiterIds: bereichsleiterIds || [],
    };

    const db = getDatabase<Area>();
    const result = await db.insert(newArea);

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

    const db = getDatabase<AreaWithMeta>();
    const existingResult = await db.find({
      selector: { id: { $eq: req.params.id } },
      limit: 1,
    });

    if (existingResult.docs.length === 0) {
      res.status(404).json({ error: 'Area not found' });
      return;
    }

    const existingArea = existingResult.docs[0];

    const updatedArea: AreaWithMeta = {
      ...existingArea,
      name,
      description: description || '',
      bereichsleiterIds: bereichsleiterIds || existingArea.bereichsleiterIds || [],
    };

    const result = await db.insert(updatedArea);

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
    const db = getDatabase<AreaWithMeta>();
    const result = await db.find({
      selector: { id: { $eq: req.params.id } },
      limit: 1,
    });

    if (result.docs.length === 0) {
      res.status(404).json({ error: 'Area not found' });
      return;
    }

    const area = result.docs[0];
    await db.destroy(area._id, area._rev);
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
