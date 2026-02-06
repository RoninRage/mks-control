import { getDatabase } from './couchdb';
import { Member } from '../types/member';

const now = new Date().toISOString();

const defaultMembers: Omit<Member, '_id' | '_rev'>[] = [
  {
    id: '1',
    firstName: 'Admin',
    lastName: 'System',
    tagUid: '2659423e',
    email: 'admin@makerspace.local',
    roles: ['admin', 'vorstand', 'bereichsleitung', 'mitglied'],
    joinDate: '2024-01-01',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '2',
    firstName: 'Backupadmin',
    lastName: 'System',
    tagUid: 'ab9c423e',
    email: 'backup@makerspace.local',
    roles: ['admin', 'vorstand', 'bereichsleitung', 'mitglied'],
    joinDate: '2024-01-01',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '3',
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max.mustermann@example.com',
    phone: '+49 123 456789',
    roles: ['mitglied'],
    joinDate: '2024-03-15',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '4',
    firstName: 'Erika',
    lastName: 'Musterfrau',
    email: 'erika.musterfrau@example.com',
    roles: ['bereichsleitung', 'mitglied'],
    joinDate: '2024-02-10',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '5',
    firstName: 'Hans',
    lastName: 'Schmidt',
    email: 'hans.schmidt@example.com',
    roles: ['mitglied'],
    joinDate: '2024-04-20',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '6',
    firstName: 'Maria',
    lastName: 'Müller',
    email: 'maria.mueller@example.com',
    roles: ['vorstand', 'mitglied'],
    joinDate: '2024-01-05',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '7',
    firstName: 'Klaus',
    lastName: 'Weber',
    email: 'klaus.weber@example.com',
    roles: ['mitglied'],
    joinDate: '2024-05-12',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '8',
    firstName: 'Anna',
    lastName: 'Meyer',
    email: 'anna.meyer@example.com',
    roles: ['mitglied'],
    joinDate: '2024-06-08',
    isActive: false,
    createdAt: now,
    updatedAt: now,
  },
];

const adminSeedMembers: Omit<Member, '_id' | '_rev'>[] = defaultMembers.filter((member) =>
  member.roles.includes('admin')
);

const ensureAdminMembers = async (db: ReturnType<typeof getDatabase>): Promise<void> => {
  const adminPromises = adminSeedMembers.map(async (member) => {
    try {
      const existing = await db.find({
        selector: { id: { $eq: member.id } },
        limit: 1,
      });

      if (existing.docs.length > 0) {
        const existingMember = existing.docs[0] as Member;
        const updatedAt = new Date().toISOString();
        const updatedMember: Member = {
          ...existingMember,
          firstName: member.firstName,
          lastName: member.lastName,
          tagUid: member.tagUid,
          email: member.email,
          roles: member.roles,
          isActive: true,
          createdAt: existingMember.createdAt ?? updatedAt,
          updatedAt,
        };

        await db.insert(updatedMember);
        return;
      }

      await db.insert(member);
    } catch (err) {
      // Failed to upsert admin member
    }
  });

  await Promise.all(adminPromises);
};

export const seedMembers = async (): Promise<void> => {
  try {
    const db = getDatabase();

    // Ensure admin members always exist and are active
    await ensureAdminMembers(db);

    // Check if members already exist by looking for actual member documents
    try {
      const existingDocs = await db.list({ include_docs: true });
      const actualMembers = existingDocs.rows.filter(
        (row) => row.doc && !row.id.startsWith('_design') && row.doc.firstName
      );

      if (actualMembers.length >= defaultMembers.length) {
        return;
      } else if (actualMembers.length > 0) {
        // Found existing members, re-seeding missing members
      }
    } catch (err) {
      // Continue with seeding
    }

    // Insert all members
    const insertPromises = defaultMembers.map(async (member) => {
      try {
        // Check if this specific member already exists
        const existing = await db.find({
          selector: { id: { $eq: member.id } },
          limit: 1,
        });

        if (existing.docs.length > 0) {
          return;
        }

        await db.insert(member);
      } catch (err) {
        // Failed to insert member, continue with others
      }
    });

    await Promise.all(insertPromises);
  } catch (err) {
    console.error(`[seed] ERROR: Failed to seed members: ${(err as Error).message}`);
    throw err;
  }
};
