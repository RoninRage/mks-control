import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDatabase } from './couchdb';
import { Area } from '../types/area';
import { Equipment } from '../types/equipment';
import { Member } from '../types/member';

type SeedCounts = {
  members: number;
  areas: number;
  equipment: number;
};

const DEFAULT_COUNTS: SeedCounts = {
  members: 150,
  areas: 20,
  equipment: 200,
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const buildId = (prefix: string, index: number): string => {
  return `${prefix}-${String(index).padStart(3, '0')}`;
};

const formatDate = (offsetDays: number): string => {
  const base = new Date('2024-01-01T00:00:00.000Z');
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
};

const loadAdminMembers = (): Array<Omit<Member, '_id' | '_rev'>> => {
  const filePath = resolve(__dirname, 'fixtures', 'members.json');
  const content = readFileSync(filePath, 'utf-8');
  const members = JSON.parse(content) as Array<Omit<Member, '_id' | '_rev'>>;
  return members.filter((member) => member.roles.includes('admin'));
};

const generateMembers = (count: number): Array<Omit<Member, '_id' | '_rev'>> => {
  const firstNames = ['Alex', 'Jamie', 'Taylor', 'Jordan', 'Morgan', 'Chris', 'Pat', 'Robin'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia'];
  const members: Array<Omit<Member, '_id' | '_rev'>> = [];

  for (let i = 1; i <= count; i += 1) {
    const firstName = firstNames[(i - 1) % firstNames.length];
    const lastName = lastNames[Math.floor((i - 1) / firstNames.length) % lastNames.length];
    const id = buildId('member', i);
    const roles = ['mitglied'];

    if (i % 10 === 0) {
      roles.push('bereichsleitung');
    }
    if (i % 25 === 0) {
      roles.push('vorstand');
    }

    members.push({
      id,
      firstName,
      lastName,
      email: `member.${id}@makerspace.local`,
      phone: `+49 30 1000${String(i).padStart(3, '0')}`,
      roles,
      joinDate: formatDate(i % 365),
      isActive: i % 15 !== 0,
    });
  }

  return members;
};

const generateAreas = (count: number, leaderIds: string[]): Array<Omit<Area, '_id' | '_rev'>> => {
  const areas: Array<Omit<Area, '_id' | '_rev'>> = [];

  for (let i = 1; i <= count; i += 1) {
    const id = buildId('area', i);
    const leader = leaderIds.length > 0 ? leaderIds[(i - 1) % leaderIds.length] : undefined;

    areas.push({
      type: 'area',
      id,
      name: `Area ${String(i).padStart(2, '0')}`,
      description: `Generated area ${String(i).padStart(2, '0')}`,
      bereichsleiterIds: leader ? [leader] : undefined,
      isActive: true,
    });
  }

  return areas;
};

const generateEquipment = (
  count: number,
  areaIds: string[]
): Array<Omit<Equipment, '_id' | '_rev'>> => {
  const equipment: Array<Omit<Equipment, '_id' | '_rev'>> = [];

  for (let i = 1; i <= count; i += 1) {
    const id = buildId('equipment', i);
    const areaId = areaIds.length > 0 ? areaIds[(i - 1) % areaIds.length] : undefined;

    equipment.push({
      type: 'equipment',
      id,
      name: `Equipment ${String(i).padStart(3, '0')}`,
      configuration: `Generated configuration ${String(i).padStart(3, '0')}`,
      areaId,
      isAvailable: i % 7 !== 0,
      isActive: true,
    });
  }

  return equipment;
};

const insertDocs = async <T extends { _id?: string }>(
  docs: T[],
  db: ReturnType<typeof getDatabase>
): Promise<void> => {
  for (const doc of docs) {
    try {
      await db.insert(doc);
    } catch (err) {
      const error = err as { statusCode?: number };
      if (error?.statusCode !== 409) {
        throw err;
      }
    }
  }
};

export const seedMassData = async (counts?: Partial<SeedCounts>): Promise<void> => {
  const membersCount = counts?.members ?? DEFAULT_COUNTS.members;
  const areasCount = counts?.areas ?? DEFAULT_COUNTS.areas;
  const equipmentCount = counts?.equipment ?? DEFAULT_COUNTS.equipment;
  const now = new Date().toISOString();

  const adminMembers = loadAdminMembers().map((member) => ({
    ...member,
    createdAt: now,
    updatedAt: now,
  }));

  const generatedMembers = generateMembers(membersCount).map((member) => ({
    ...member,
    createdAt: now,
    updatedAt: now,
  }));

  const allMembers = [...adminMembers, ...generatedMembers].map((member) => ({
    ...member,
    _id: `member:${member.id}`,
  }));

  const leaderIds = generatedMembers
    .filter((member) => member.roles.includes('bereichsleitung'))
    .map((member) => member.id);

  const areas = generateAreas(areasCount, leaderIds).map((area) => ({
    ...area,
    createdAt: now,
    updatedAt: now,
    _id: `area:${area.id}`,
  }));

  const equipment = generateEquipment(
    equipmentCount,
    areas.map((area) => area.id)
  ).map((item) => ({
    ...item,
    createdAt: now,
    updatedAt: now,
    _id: `equipment:${item.id}`,
  }));

  const memberDb = getDatabase<Member>();
  const areaDb = getDatabase<Area>();
  const equipmentDb = getDatabase<Equipment>();

  await insertDocs(areas, areaDb);
  await insertDocs(equipment, equipmentDb);
  await insertDocs(allMembers, memberDb);
};

export const getSeedCountsFromEnv = (): SeedCounts => {
  return {
    members: toPositiveInt(process.env.SEED_MEMBERS, DEFAULT_COUNTS.members),
    areas: toPositiveInt(process.env.SEED_AREAS, DEFAULT_COUNTS.areas),
    equipment: toPositiveInt(process.env.SEED_EQUIPMENT, DEFAULT_COUNTS.equipment),
  };
};
