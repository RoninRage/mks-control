import { getDatabase, getTagDatabase } from './couchdb';
import { nanoid } from 'nanoid';
import { Member } from '../types/member';
import { Tag } from '../types/tag';

export const migrateTagsToCollection = async (): Promise<void> => {
  try {
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
      return;
    }

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
        migratedCount++;
      } catch (err) {
        console.error(`Error migrating tag for member ${member.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    console.error(`Error during tag migration: ${(err as Error).message}`);
    throw err;
  }
};

export const migrateDocTypes = async (): Promise<void> => {
  try {
    const db = getDatabase();

    const result = await db.find({
      selector: { type: { $exists: false } },
    });

    if (result.docs.length === 0) {
      return;
    }

    let updatedCount = 0;

    for (const doc of result.docs as Record<string, unknown>[]) {
      const rawId = typeof doc._id === 'string' ? doc._id : '';
      if (rawId.startsWith('_design') || rawId.startsWith('_local')) {
        continue;
      }

      const hasIsAvailable = typeof doc.isAvailable === 'boolean';
      const hasAreaId = typeof doc.areaId === 'string';
      const hasDescription = typeof doc.description === 'string';

      if (hasDescription) {
        (doc as { type?: string }).type = 'area';
      } else if (hasIsAvailable || hasAreaId) {
        (doc as { type?: string }).type = 'equipment';
      } else {
        continue;
      }

      await db.insert(doc as Record<string, unknown>);
      updatedCount += 1;
    }
  } catch (err) {
    console.error(`Error during doc type migration: ${(err as Error).message}`);
    throw err;
  }
};
