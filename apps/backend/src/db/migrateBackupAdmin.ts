import { getDatabase } from './couchdb';
import { Member } from '../types/member';

/**
 * Migration to fix BackupAdmin member's firstName and lastName
 * This ensures the member is displayed correctly as "Backupadmin System"
 */
export const migrateBackupAdmin = async (): Promise<void> => {
  try {
    const db = getDatabase<Member>();

    // Find the BackupAdmin member by ID
    const result = await db.find({
      selector: { id: { $eq: '2' } },
      limit: 1,
    });

    if (result.docs.length === 0) {
      return;
    }

    const member = result.docs[0];

    // Check if migration is needed
    if (member.firstName === 'Backupadmin' && member.lastName === 'System') {
      return;
    }

    // Update the member
    const updatedMember: Member = {
      ...member,
      firstName: 'Backupadmin',
      lastName: 'System',
    };

    await db.insert(updatedMember);
  } catch (err) {
    throw err;
  }
};
