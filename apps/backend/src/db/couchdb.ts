import nano, { ServerScope } from 'nano';
import { AuditLog } from '../types/audit';
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
  auditDbName: string;
} => {
  const url = process.env.COUCHDB_URL ?? 'http://localhost:5984';
  const user = process.env.COUCHDB_USER ?? 'admin';
  const password = process.env.COUCHDB_PASSWORD ?? 'password';
  const dbName = process.env.COUCHDB_DB_NAME ?? 'mks_members';
  const tagsDbName = process.env.COUCHDB_TAGS_DB_NAME ?? 'mks_tags';
  const auditDbName = process.env.COUCHDB_AUDIT_DB_NAME ?? 'mks_audit';

  return { url, user, password, dbName, tagsDbName, auditDbName };
};

let dbInstance: nano.DocumentScope<Member> | null = null;
let tagDbInstance: nano.DocumentScope<Tag> | null = null;
let auditDbInstance: nano.DocumentScope | null = null;
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

    // Check if audit database exists
    if (!dbList.includes(config.auditDbName)) {
      await nanoInstance.db.create(config.auditDbName);
    }

    dbInstance = nanoInstance.use<Member>(config.dbName);
    tagDbInstance = nanoInstance.use<Tag>(config.tagsDbName);
    auditDbInstance = nanoInstance.use<AuditLog>(config.auditDbName);

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

    // Create indexes for audit database
    try {
      await auditDbInstance.createIndex({
        index: {
          fields: ['timestamp'],
        },
        name: 'timestamp-index',
      });
    } catch (err) {
      // Index might already exist
    }

    try {
      await auditDbInstance.createIndex({
        index: {
          fields: ['action'],
        },
        name: 'action-index',
      });
    } catch (err) {
      // Index might already exist
    }

    try {
      await auditDbInstance.createIndex({
        index: {
          fields: ['actorId'],
        },
        name: 'actor-id-index',
      });
    } catch (err) {
      // Index might already exist
    }

    try {
      await auditDbInstance.createIndex({
        index: {
          fields: ['targetId'],
        },
        name: 'target-id-index',
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

export const getAuditDatabase = (): nano.DocumentScope<AuditLog> => {
  if (!auditDbInstance) {
    throw new Error('Audit database not initialized. Call initializeDatabase() first.');
  }
  return auditDbInstance as nano.DocumentScope<AuditLog>;
};

export const getNanoInstance = (): ServerScope => {
  if (!nanoInstance) {
    throw new Error('Nano instance not initialized. Call initializeDatabase() first.');
  }
  return nanoInstance;
};
