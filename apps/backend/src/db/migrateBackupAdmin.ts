import { getDatabase } from './couchdb';
import { Member } from '../types/member';

const log = (message: string): void => {
  console.log(`[migrate-backup-admin] ${message}`);
};

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
      log('BackupAdmin member not found (ID: 2)');
      return;
    }

    const member = result.docs[0];

    // Check if migration is needed
    if (member.firstName === 'Backupadmin' && member.lastName === 'System') {
      log('BackupAdmin member already has correct firstName and lastName');
      return;
    }

    log(`Updating BackupAdmin member from "${member.firstName} ${member.lastName}" to "Backupadmin System"`);

    // Update the member
    const updatedMember: Member = {
      ...member,
      firstName: 'Backupadmin',
      lastName: 'System',
    };

    await db.insert(updatedMember);
    log('Successfully updated BackupAdmin member');
  } catch (err) {
    log(`ERROR: Failed to migrate BackupAdmin: ${(err as Error).message}`);
    throw err;
  }
};
