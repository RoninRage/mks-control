import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDatabase } from './couchdb';
import { Area } from '../types/area';

const loadAreasFixture = (): Array<Omit<Area, '_id' | '_rev' | 'createdAt' | 'updatedAt'>> => {
  const filePath = resolve(__dirname, 'fixtures', 'areas.json');
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Array<Omit<Area, '_id' | '_rev' | 'createdAt' | 'updatedAt'>>;
};

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

    const now = new Date().toISOString();
    const defaultAreas = loadAreasFixture();

    for (const area of defaultAreas) {
      await db.insert({
        ...area,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error) {
    throw error;
  }
};
