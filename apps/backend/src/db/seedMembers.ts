import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDatabase } from './couchdb';
import { Member } from '../types/member';

const loadMembersFixture = (): Array<Omit<Member, '_id' | '_rev' | 'createdAt' | 'updatedAt'>> => {
  const filePath = resolve(__dirname, 'fixtures', 'members.json');
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Array<Omit<Member, '_id' | '_rev' | 'createdAt' | 'updatedAt'>>;
};

const addTimestamps = (
  member: Omit<Member, '_id' | '_rev' | 'createdAt' | 'updatedAt'>,
  now: string
): Omit<Member, '_id' | '_rev'> => ({
  ...member,
  createdAt: now,
  updatedAt: now,
});

const ensureAdminMembers = async (
  db: ReturnType<typeof getDatabase>,
  adminSeedMembers: Array<Omit<Member, '_id' | '_rev'>>
): Promise<void> => {
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
    const now = new Date().toISOString();
    const defaultMembers = loadMembersFixture().map((member) => addTimestamps(member, now));
    const adminSeedMembers = defaultMembers.filter((member) => member.roles.includes('admin'));

    // Ensure admin members always exist and are active
    await ensureAdminMembers(db, adminSeedMembers);

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
