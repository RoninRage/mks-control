import { getDatabase } from './couchdb';
import { Area } from '../types/area';

const now = new Date().toISOString();

const defaultAreas: Omit<Area, '_id' | '_rev'>[] = [
  {
    type: 'area',
    id: '1',
    name: 'Elektronik',
    description: 'Bereich für elektronische Projekte und Arbeiten',
    createdAt: now,
    updatedAt: now,
  },
  {
    type: 'area',
    id: '2',
    name: '3D Druck',
    description: 'Bereich für 3D-Drucker und additive Fertigung',
    createdAt: now,
    updatedAt: now,
  },
  {
    type: 'area',
    id: '3',
    name: 'Werkstatt',
    description: 'Allgemeine Werkstatt mit Hand- und Elektrowerkzeugen',
    createdAt: now,
    updatedAt: now,
  },
];

export const seedAreas = async (): Promise<void> => {
  try {
    const db = getDatabase<Area>();

    // Check if areas already exist
    const result = await db.find({
      selector: { type: { $eq: 'area' } },
      limit: 1,
    });

    if (result.docs.length > 0) {
      return;
    }

    for (const area of defaultAreas) {
      await db.insert(area);
    }
  } catch (error) {
    throw error;
  }
};
