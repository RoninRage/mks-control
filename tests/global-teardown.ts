import { FullConfig } from '@playwright/test';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { deleteTestDatabases, getTestNano } from './helpers/database';

/**
 * Global teardown for Playwright E2E tests
 *
 * Deletes ephemeral test databases
 */
async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 Starting global test teardown...\n');

  const membersDbName = process.env.TEST_MEMBERS_DB_NAME;
  const tagsDbName = process.env.TEST_TAGS_DB_NAME;

  if (!membersDbName || !tagsDbName) {
    console.warn('⚠️  Test database names not found. Skipping cleanup.');
    return;
  }

  const usageDbName = process.env.TEST_USAGE_DB_NAME;
  if (usageDbName) {
    try {
      await getTestNano().db.destroy(usageDbName);
      console.log(`[test-db] Deleted usage database: ${usageDbName}`);
    } catch {
      // The backend creates it on start; it may not exist if the backend never ran.
    }
  }

  try {
    await deleteTestDatabases(membersDbName, tagsDbName);
    console.log('✅ Test databases cleaned up successfully\n');
  } catch (error) {
    console.error('❌ Teardown failed:', error);
    // Don't throw - allow tests to complete even if cleanup fails
  }

  // Clean up .env.test file
  try {
    const envPath = join(process.cwd(), '.env.test');
    unlinkSync(envPath);
    console.log('🗑️  Removed .env.test file\n');
  } catch (error) {
    // File may not exist, that's okay
  }
}

export default globalTeardown;
