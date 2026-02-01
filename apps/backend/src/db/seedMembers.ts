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
    tagUid: '11223344',
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
    tagUid: '55667788',
    email: 'erika.musterfrau@example.com',
    roles: ['bereichsleitung', 'mitglied'],
    joinDate: '2024-02-10',
    isActive: true,
  },
  {
    id: '5',
    firstName: 'Hans',
    lastName: 'Schmidt',
    tagUid: '99aabbcc',
    email: 'hans.schmidt@example.com',
    roles: ['mitglied'],
    joinDate: '2024-04-20',
    isActive: true,
  },
  {
    id: '6',
    firstName: 'Maria',
    lastName: 'Müller',
    tagUid: 'ddeeff00',
    email: 'maria.mueller@example.com',
    roles: ['vorstand', 'mitglied'],
    joinDate: '2024-01-05',
    isActive: true,
  },
  {
    id: '7',
    firstName: 'Klaus',
    lastName: 'Weber',
    tagUid: '1a2b3c4d',
    email: 'klaus.weber@example.com',
    roles: ['mitglied'],
    joinDate: '2024-05-12',
    isActive: true,
  },
  {
    id: '8',
    firstName: 'Anna',
    lastName: 'Meyer',
    tagUid: '5e6f7g8h',
    email: 'anna.meyer@example.com',
    roles: ['mitglied'],
    joinDate: '2024-06-08',
    isActive: false,
  },
];

export const seedMembers = async (): Promise<void> => {
  try {
    const db = getDatabase();

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
