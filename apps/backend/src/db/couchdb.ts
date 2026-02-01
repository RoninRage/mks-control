import nano, { ServerScope } from 'nano';
import { Member } from '../types/member';
import { Tag } from '../types/tag';

const error = (message: string): void => {
  console.error(`[couchdb] ERROR: ${message}`);
};

const getCouchDBConfig = (): {
  url: string;
  user: string;
  password: string;
  dbName: string;
  tagsDbName: string;
} => {
  const url = process.env.COUCHDB_URL ?? 'http://localhost:5984';
  const user = process.env.COUCHDB_USER ?? 'admin';
  const password = process.env.COUCHDB_PASSWORD ?? 'password';
  const dbName = process.env.COUCHDB_DB_NAME ?? 'mks_members';
  const tagsDbName = process.env.COUCHDB_TAGS_DB_NAME ?? 'mks_tags';

  return { url, user, password, dbName, tagsDbName };
};

let dbInstance: nano.DocumentScope<Member> | null = null;
let tagDbInstance: nano.DocumentScope<Tag> | null = null;
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
    // Check if members database exists
    const dbList = await nanoInstance.db.list();
    if (!dbList.includes(config.dbName)) {
      await nanoInstance.db.create(config.dbName);
    }

    // Check if tags database exists
    if (!dbList.includes(config.tagsDbName)) {
      await nanoInstance.db.create(config.tagsDbName);
    }

    dbInstance = nanoInstance.use<Member>(config.dbName);
    tagDbInstance = nanoInstance.use<Tag>(config.tagsDbName);

    // Create indexes for members database
    try {
      await dbInstance.createIndex({
        index: {
          fields: ['tagUid'],
        },
        name: 'tag-uid-index',
      });
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
    } catch (err) {
      // Index might already exist
    }

    // Create indexes for tags database
    try {
      await tagDbInstance.createIndex({
        index: {
          fields: ['tagUid'],
        },
        name: 'tag-uid-index',
      });
    } catch (err) {
      // Index might already exist
    }

    try {
      await tagDbInstance.createIndex({
        index: {
          fields: ['memberId'],
        },
        name: 'member-id-index',
      });
    } catch (err) {
      // Index might already exist
    }

    try {
      await tagDbInstance.createIndex({
        index: {
          fields: ['isActive'],
        },
        name: 'active-status-index',
      });
    } catch (err) {
      // Index might already exist
    }
  } catch (err) {
    error(`Failed to initialize database: ${(err as Error).message}`);
    throw err;
  }
};

export const getDatabase = <T = Member>(): nano.DocumentScope<T> => {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance as unknown as nano.DocumentScope<T>;
};

export const getTagDatabase = (): nano.DocumentScope<Tag> => {
  if (!tagDbInstance) {
    throw new Error('Tag database not initialized. Call initializeDatabase() first.');
  }
  return tagDbInstance;
};

export const getNanoInstance = (): ServerScope => {
  if (!nanoInstance) {
    throw new Error('Nano instance not initialized. Call initializeDatabase() first.');
  }
  return nanoInstance;
};
