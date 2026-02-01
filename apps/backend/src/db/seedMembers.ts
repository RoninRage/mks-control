import { getDatabase } from './couchdb';
import { Member } from '../types/member';

const log = (message: string): void => {
  console.log(`[seed] ${message}`);
};

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
  },
  {
    id: '4',
    firstName: 'Erika',
    lastName: 'Musterfrau',
    email: 'erika.musterfrau@example.com',
    roles: ['bereichsleitung', 'mitglied'],
    joinDate: '2024-02-10',
    isActive: true,
  },
  {
    id: '5',
    firstName: 'Hans',
    lastName: 'Schmidt',
    email: 'hans.schmidt@example.com',
    roles: ['mitglied'],
    joinDate: '2024-04-20',
    isActive: true,
  },
  {
    id: '6',
    firstName: 'Maria',
    lastName: 'Müller',
    email: 'maria.mueller@example.com',
    roles: ['vorstand', 'mitglied'],
    joinDate: '2024-01-05',
    isActive: true,
  },
  {
    id: '7',
    firstName: 'Klaus',
    lastName: 'Weber',
    email: 'klaus.weber@example.com',
    roles: ['mitglied'],
    joinDate: '2024-05-12',
    isActive: true,
  },
  {
    id: '8',
    firstName: 'Anna',
    lastName: 'Meyer',
    email: 'anna.meyer@example.com',
    roles: ['mitglied'],
    joinDate: '2024-06-08',
    isActive: false,
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
        const updatedMember: Member = {
          ...existingMember,
          firstName: member.firstName,
          lastName: member.lastName,
          tagUid: member.tagUid,
          email: member.email,
          roles: member.roles,
          isActive: true,
        };

        await db.insert(updatedMember);
        log(`Updated admin member: ${member.firstName} ${member.lastName}`);
        return;
      }

      await db.insert(member);
      log(`Inserted admin member: ${member.firstName} ${member.lastName} (${member.tagUid})`);
    } catch (err) {
      log(
        `Failed to upsert admin ${member.firstName} ${member.lastName}: ${(err as Error).message}`
      );
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
        log(`Database already seeded with ${actualMembers.length} members`);
        return;
      } else if (actualMembers.length > 0) {
        log(
          `Found ${actualMembers.length} existing members, expected ${defaultMembers.length}. Re-seeding missing members...`
        );
      }
    } catch (err) {
      // Continue with seeding
    }

    log('Seeding default members...');

    // Insert all members
    const insertPromises = defaultMembers.map(async (member) => {
      try {
        // Check if this specific member already exists
        const existing = await db.find({
          selector: { id: { $eq: member.id } },
          limit: 1,
        });

        if (existing.docs.length > 0) {
          log(`Member already exists: ${member.firstName} ${member.lastName}`);
          return;
        }

        await db.insert(member);
        log(`Inserted member: ${member.firstName} ${member.lastName} (${member.tagUid})`);
      } catch (err) {
        log(`Failed to insert ${member.firstName} ${member.lastName}: ${(err as Error).message}`);
      }
    });

    await Promise.all(insertPromises);

    log(`Seeding completed. ${defaultMembers.length} members processed.`);
  } catch (err) {
    console.error(`[seed] ERROR: Failed to seed members: ${(err as Error).message}`);
    throw err;
  }
};
