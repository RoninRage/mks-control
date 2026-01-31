import { getDatabase } from './couchdb';
import { Area } from '../types/area';

const log = (message: string): void => {
  console.log(`[seed] ${message}`);
};

const defaultAreas: Omit<Area, '_id' | '_rev'>[] = [
  {
    id: '1',
    name: 'Elektronik',
    description: 'Bereich für elektronische Projekte und Arbeiten',
  },
  {
    id: '2',
    name: '3D Druck',
    description: 'Bereich für 3D-Drucker und additive Fertigung',
  },
  {
    id: '3',
    name: 'Werkstatt',
    description: 'Allgemeine Werkstatt mit Hand- und Elektrowerkzeugen',
  },
];

export const seedAreas = async (): Promise<void> => {
  try {
    const db = getDatabase<Area>();

    // Check if areas already exist
    const result = await db.find({
      selector: { name: { $gt: null }, description: { $gt: null } },
      limit: 1,
    });

    if (result.docs.length > 0) {
      log('Areas already seeded');
      return;
    }

    for (const area of defaultAreas) {
      await db.insert(area);
    }

    log(`Successfully seeded ${defaultAreas.length} areas`);
  } catch (error) {
    log(`Error seeding areas: ${(error as Error).message}`);
    throw error;
  }
};
