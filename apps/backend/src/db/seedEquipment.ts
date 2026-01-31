import { getDatabase } from './couchdb';
import { Equipment } from '../types/equipment';

const log = (message: string): void => {
  console.log(`[seed] ${message}`);
};

const defaultEquipment: Omit<Equipment, '_id' | '_rev'>[] = [
  {
    id: '1',
    name: 'Lötstation',
    area: 'Elektronik',
    isAvailable: true,
  },
  {
    id: '2',
    name: '3D-Drucker Prusa i3',
    area: '3D Druck',
    isAvailable: true,
  },
  {
    id: '3',
    name: 'CNC-Fräsmaschine',
    area: 'Werkstatt',
    isAvailable: false,
  },
];

export const seedEquipment = async (): Promise<void> => {
  try {
    const db = getDatabase<Equipment>();

    const result = await db.find({
      selector: { name: { $gt: null }, isAvailable: { $exists: true } },
      limit: 1,
    });

    if (result.docs.length > 0) {
      log('Equipment already seeded');
      return;
    }

    for (const item of defaultEquipment) {
      await db.insert(item);
    }

    log(`Successfully seeded ${defaultEquipment.length} equipment items`);
  } catch (error) {
    log(`Error seeding equipment: ${(error as Error).message}`);
    throw error;
  }
};
