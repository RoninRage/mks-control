import { FullConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createTestDatabases, seedDatabase } from './helpers/database';
import { loginWithWebNfc, TEST_ADMIN_API_TAG } from './helpers/session';
import {
  createTestAdminUser,
  createTestAreas,
  createTestUser,
  resetNameCounter,
} from './helpers/factories';

/**
 * Global setup for Playwright E2E tests
 *
 * Creates ephemeral test databases and seeds initial test data
 */
async function globalSetup(_config: FullConfig) {
  console.log('\n🚀 Starting global test setup...\n');

  // Reset factory counter for deterministic test data
  resetNameCounter();

  // Read database names from .env.test (created by pretest:e2e script)
  const envPath = join(process.cwd(), '.env.test');
  const envContent = readFileSync(envPath, 'utf-8');

  const membersDbMatch = envContent.match(/COUCHDB_DB_NAME=(.+)/);
  const tagsDbMatch = envContent.match(/COUCHDB_TAGS_DB_NAME=(.+)/);

  if (!membersDbMatch || !tagsDbMatch) {
    throw new Error('Could not read database names from .env.test');
  }

  const usageDbMatch = envContent.match(/COUCHDB_USAGE_DB_NAME=(.+)/);
  if (usageDbMatch) {
    process.env.TEST_USAGE_DB_NAME = usageDbMatch[1].trim();
  }

  const membersDbName = membersDbMatch[1].trim();
  const tagsDbName = tagsDbMatch[1].trim();

  console.log(`📦 Using database names from .env.test:`);
  console.log(`   Members: ${membersDbName}`);
  console.log(`   Tags: ${tagsDbName}\n`);

  // Set environment variables
  process.env.TEST_MEMBERS_DB_NAME = membersDbName;
  process.env.TEST_TAGS_DB_NAME = tagsDbName;
  process.env.COUCHDB_DB_NAME = membersDbName;
  process.env.COUCHDB_TAGS_DB_NAME = tagsDbName;

  try {
    // Create test databases
    const { membersDb, tagsDb } = await createTestDatabases(membersDbName, tagsDbName);

    // Seed initial test data
    console.log('\n🌱 Seeding initial test data...');

    // Create test admin user (matches ADMIN_TAG_UIDS in playwright.config.ts)
    const adminUser = createTestAdminUser({
      member: {
        id: 'test-admin-001',
        firstName: 'Test',
        lastName: 'Admin',
      },
      tag: {
        tagUid: 'test-admin-tag-001', // Must match ADMIN_TAG_UIDS env var
      },
    });

    // Create a regular test member
    const regularUser = createTestUser({
      member: {
        id: 'test-member-001',
        firstName: 'Test',
        lastName: 'Member',
      },
      tag: {
        tagUid: 'test-member-tag-001',
      },
    });

    // Create an inactive member (for testing inactive user scenarios)
    const inactiveUser = createTestUser({
      member: {
        id: 'test-inactive-001',
        firstName: 'Inactive',
        lastName: 'User',
        isActive: false,
      },
      tag: {
        tagUid: 'test-inactive-tag-001',
      },
    });

    // A board member for permission tests
    const boardUser = createTestUser({
      member: {
        id: 'test-vorstand-001',
        firstName: 'Test',
        lastName: 'Vorstand',
        roles: ['vorstand', 'mitglied'],
      },
      tag: { tagUid: 'test-vorstand-tag-001' },
    });

    // Seed members
    await seedDatabase(membersDb, [
      adminUser.member,
      regularUser.member,
      inactiveUser.member,
      boardUser.member,
    ]);

    // Second tag of the admin for API logins in tests: tags in ADMIN_TAG_UIDS do not work via
    // Web NFC (docs/auth-plan.md), so API tests log in with this one.
    const adminApiTag = { ...adminUser.tag, id: 'test-admin-api-tag', tagUid: TEST_ADMIN_API_TAG };

    // Seed tags
    await seedDatabase(tagsDb, [
      adminUser.tag,
      adminApiTag,
      regularUser.tag,
      inactiveUser.tag,
      boardUser.tag,
    ]);

    // Seed areas in primary database
    const areas = createTestAreas(3, {
      description: 'Standardbereich für E2E',
    });
    await seedDatabase(membersDb, areas);

    console.log('✅ Test data seeded successfully\n');

    // Wait a moment for database indexes to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Sessions for API requests in the tests (ADMIN_HEADERS, MEMBER_HEADERS). The web server
    // is already running; set here, the tokens reach the test workers through process.env.
    process.env.TEST_ADMIN_TOKEN = await loginWithWebNfc(TEST_ADMIN_API_TAG);
    process.env.TEST_MEMBER_TOKEN = await loginWithWebNfc('test-member-tag-001');
    process.env.TEST_VORSTAND_TOKEN = await loginWithWebNfc('test-vorstand-tag-001');
    console.log('🔑 Test sessions created');

    console.log('✅ Global setup complete!\n');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

export default globalSetup;
