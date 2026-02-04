import nano, { DocumentScope, ServerScope } from 'nano';

/**
 * CouchDB test database utilities
 */

export interface DatabaseConnection {
  server: ServerScope;
  membersDb: DocumentScope<any>;
  tagsDb: DocumentScope<any>;
  membersDbName: string;
  tagsDbName: string;
}

/**
 * Get CouchDB connection URL from environment
 */
export function getCouchDBUrl(): string {
  const url = process.env.COUCHDB_URL || 'http://localhost:5984';
  const user = process.env.COUCHDB_USER || 'admin';
  const password = process.env.COUCHDB_PASSWORD || 'password';

  // Parse URL and inject credentials
  const urlObj = new URL(url);
  urlObj.username = user;
  urlObj.password = password;

  return urlObj.toString();
}

/**
 * Generate unique test database names
 */
export function generateTestDbNames(): { membersDbName: string; tagsDbName: string } {
  const timestamp = Date.now();
  const pid = process.pid;

  return {
    membersDbName: `mks_members_test_${timestamp}_${pid}`,
    tagsDbName: `mks_tags_test_${timestamp}_${pid}`,
  };
}

/**
 * Create test databases
 */
export async function createTestDatabases(
  membersDbName: string,
  tagsDbName: string
): Promise<DatabaseConnection> {
  const couchUrl = getCouchDBUrl();
  const server = nano(couchUrl);

  // Create members database
  try {
    await server.db.create(membersDbName);
    console.log(`[test-db] Created members database: ${membersDbName}`);
  } catch (error) {
    const err = error as { statusCode?: number; error?: string };
    if (err.statusCode === 412 || err.error === 'file_exists') {
      console.log(`[test-db] Members database already exists: ${membersDbName}`);
    } else {
      throw error;
    }
  }

  // Create tags database
  try {
    await server.db.create(tagsDbName);
    console.log(`[test-db] Created tags database: ${tagsDbName}`);
  } catch (error) {
    const err = error as { statusCode?: number; error?: string };
    if (err.statusCode === 412 || err.error === 'file_exists') {
      console.log(`[test-db] Tags database already exists: ${tagsDbName}`);
    } else {
      throw error;
    }
  }

  const membersDb = server.use(membersDbName);
  const tagsDb = server.use(tagsDbName);

  // Create indexes for queries
  await membersDb.createIndex({
    index: { fields: ['id'] },
    name: 'idx-member-id',
  });

  await membersDb.createIndex({
    index: { fields: ['isActive'] },
    name: 'idx-member-active',
  });

  await tagsDb.createIndex({
    index: { fields: ['tagUid', 'isActive'] },
    name: 'idx-tag-uid-active',
  });

  await tagsDb.createIndex({
    index: { fields: ['memberId'] },
    name: 'idx-tag-member',
  });

  console.log('[test-db] Created database indexes');

  return {
    server,
    membersDb,
    tagsDb,
    membersDbName,
    tagsDbName,
  };
}

/**
 * Delete test databases
 */
export async function deleteTestDatabases(
  membersDbName: string,
  tagsDbName: string
): Promise<void> {
  const couchUrl = getCouchDBUrl();
  const server = nano(couchUrl);

  try {
    await server.db.destroy(membersDbName);
    console.log(`[test-db] Deleted members database: ${membersDbName}`);
  } catch (err) {
    console.error(`[test-db] Failed to delete ${membersDbName}:`, (err as Error).message);
  }

  try {
    await server.db.destroy(tagsDbName);
    console.log(`[test-db] Deleted tags database: ${tagsDbName}`);
  } catch (err) {
    console.error(`[test-db] Failed to delete ${tagsDbName}:`, (err as Error).message);
  }
}

/**
 * Seed database with documents
 */
export async function seedDatabase<T extends { _id?: string }>(
  db: DocumentScope<T>,
  documents: T[]
): Promise<void> {
  if (documents.length === 0) return;

  const result = await db.bulk({ docs: documents });

  const errors = result.filter((r) => !(r as any).ok);
  if (errors.length > 0) {
    throw new Error(`Failed to seed database: ${JSON.stringify(errors)}`);
  }

  console.log(`[test-db] Seeded ${documents.length} documents`);
}

/**
 * Get database connection from environment variables
 * (set by global-setup.ts)
 */
export function getTestDatabaseConnection(): DatabaseConnection {
  const membersDbName = process.env.TEST_MEMBERS_DB_NAME;
  const tagsDbName = process.env.TEST_TAGS_DB_NAME;

  if (!membersDbName || !tagsDbName) {
    throw new Error('Test database names not found in environment. Did global-setup run?');
  }

  const couchUrl = getCouchDBUrl();
  const server = nano(couchUrl);

  return {
    server,
    membersDb: server.use(membersDbName),
    tagsDb: server.use(tagsDbName),
    membersDbName,
    tagsDbName,
  };
}
