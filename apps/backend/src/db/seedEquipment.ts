import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDatabase } from './couchdb';
import { Equipment } from '../types/equipment';

const loadEquipmentFixture = (): Array<Omit<Equipment, '_id' | '_rev' | 'createdAt' | 'updatedAt'>> => {
  const filePath = resolve(__dirname, 'fixtures', 'equipment.json');
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Array<Omit<Equipment, '_id' | '_rev' | 'createdAt' | 'updatedAt'>>;
};

export const seedEquipment = async (): Promise<void> => {
  try {
    const db = getDatabase<Equipment>();

    const result = await db.find({
      selector: { type: { $eq: 'equipment' } },
      limit: 1,
    });

    if (result.docs.length > 0) {
      return;
    }

    const now = new Date().toISOString();
    const defaultEquipment = loadEquipmentFixture();

    for (const item of defaultEquipment) {
      await db.insert({
        ...item,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error) {
    throw error;
  }
};
