import nano, { ServerScope } from 'nano';
import { Member } from '../types/member';

const log = (message: string): void => {
  console.log(`[couchdb] ${message}`);
};

const error = (message: string): void => {
  console.error(`[couchdb] ERROR: ${message}`);
};

const getCouchDBConfig = (): {
  url: string;
  user: string;
  password: string;
  dbName: string;
} => {
  const url = process.env.COUCHDB_URL ?? 'http://localhost:5984';
  const user = process.env.COUCHDB_USER ?? 'admin';
  const password = process.env.COUCHDB_PASSWORD ?? 'password';
  const dbName = process.env.COUCHDB_DB_NAME ?? 'mks_members';

  return { url, user, password, dbName };
};

let dbInstance: nano.DocumentScope<Member> | null = null;
let nanoInstance: ServerScope | null = null;

export const initializeDatabase = async (): Promise<void> => {
  if (process.env.MONOREPO_DEV !== 'true') {
    error('Database can only be initialized via monorepo dev mode');
    throw new Error('Invalid startup mode');
  }

  const config = getCouchDBConfig();
  const authUrl = `http://${config.user}:${config.password}@${config.url.replace('http://', '')}`;

  nanoInstance = nano(authUrl);

  try {
    // Check if database exists
    const dbList = await nanoInstance.db.list();
    if (!dbList.includes(config.dbName)) {
      log(`Creating database: ${config.dbName}`);
      await nanoInstance.db.create(config.dbName);
      log(`Database created: ${config.dbName}`);
    } else {
      log(`Database already exists: ${config.dbName}`);
    }

    dbInstance = nanoInstance.use<Member>(config.dbName);

    // Create indexes for efficient queries
    try {
      await dbInstance.createIndex({
        index: {
          fields: ['tagUid'],
        },
        name: 'tag-uid-index',
      });
      log('Created index: tag-uid-index');
    } catch (err) {
      // Index might already exist
    }

    try {
      await dbInstance.createIndex({
        index: {
          fields: ['isActive'],
        },
        name: 'active-status-index',
      });
      log('Created index: active-status-index');
    } catch (err) {
      // Index might already exist
    }

    log('Database initialized successfully');
  } catch (err) {
    error(`Failed to initialize database: ${(err as Error).message}`);
    throw err;
  }
};

export const getDatabase = (): nano.DocumentScope<Member> => {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
};

export const getNanoInstance = (): ServerScope => {
  if (!nanoInstance) {
    throw new Error('Nano instance not initialized. Call initializeDatabase() first.');
  }
  return nanoInstance;
};
