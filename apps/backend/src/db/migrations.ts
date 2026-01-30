import { getDatabase, getTagDatabase } from './couchdb';
import { nanoid } from 'nanoid';
import { Member } from '../types/member';
import { Tag } from '../types/tag';

const log = (message: string): void => {
  console.log(`[migration] ${message}`);
};

export const migrateTagsToCollection = async (): Promise<void> => {
  try {
    log('Starting tag migration from members.tagUid to tags collection...');
    const db = getDatabase();
    const tagDb = getTagDatabase();

    // Get all members with tagUid
    const result = await db.find({
      selector: { tagUid: { $exists: true } },
    });

    const membersWithTags = result.docs.filter(
      (doc: Member) => doc.tagUid && doc.tagUid.length > 0
    );

    if (membersWithTags.length === 0) {
      log('No members with tagUid found, skipping migration');
      return;
    }

    log(`Found ${membersWithTags.length} members with tagUid, migrating...`);

    // Migrate each tagUid to tags collection
    let migratedCount = 0;
    for (const member of membersWithTags) {
      try {
        // Check if tag already exists in tags collection
        const existingTag = await tagDb.find({
          selector: { tagUid: { $eq: member.tagUid }, memberId: { $eq: member.id } },
          limit: 1,
        });

        if (existingTag.docs.length > 0) {
          log(`Tag ${member.tagUid} already migrated for member ${member.id}`);
          continue;
        }

        // Create new tag document
        const tagId = nanoid();
        const newTag: Tag = {
          id: tagId,
          tagUid: member.tagUid!,
          memberId: member.id,
          createdAt: new Date().toISOString(),
          isActive: true,
        };

        await tagDb.insert(newTag);
        log(`Migrated tag ${member.tagUid} for member ${member.firstName} ${member.lastName}`);
        migratedCount++;
      } catch (err) {
        console.error(`Error migrating tag for member ${member.id}: ${(err as Error).message}`);
      }
    }

    log(`Migration completed: ${migratedCount} tags migrated to collection`);
  } catch (err) {
    console.error(`Error during tag migration: ${(err as Error).message}`);
    throw err;
  }
};
