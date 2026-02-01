import { getDatabase } from './couchdb';
import { Equipment } from '../types/equipment';

const defaultEquipment: Omit<Equipment, '_id' | '_rev'>[] = [
  {
    type: 'equipment',
    id: '1',
    name: 'Lötstation',
    configuration: 'Temperaturregelung, 60W Leistung',
    areaId: '1',
    isAvailable: true,
  },
  {
    type: 'equipment',
    id: '2',
    name: '3D-Drucker Prusa i3',
    configuration: '0.4mm Düse, PLA/ABS',
    areaId: '2',
    isAvailable: true,
  },
  {
    type: 'equipment',
    id: '3',
    name: 'CNC-Fräsmaschine',
    configuration: 'Arbeitsbereich 600x400mm',
    areaId: '3',
    isAvailable: false,
  },
];

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

    for (const item of defaultEquipment) {
      await db.insert(item);
    }
  } catch (error) {
    throw error;
  }
};
