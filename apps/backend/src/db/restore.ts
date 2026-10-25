import { readdir, readFile } from 'fs/promises';
import path from 'path';

// Restores a backup made by backup.ts:
//   npx ts-node --transpile-only src/db/restore.ts /backup/2026-10-25
// Creates missing databases and writes all documents with their revisions (new_edits=false),
// so documents that still exist unchanged stay as they are. Stop the backend first.

const couchUrl = (process.env.COUCHDB_URL ?? 'http://localhost:5984').replace(/\/+$/, '');
const user = process.env.COUCHDB_USER ?? 'admin';
const password = process.env.COUCHDB_PASSWORD ?? 'password';
const authHeader = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
const CHUNK_SIZE = 500;

interface BackupFile {
  db: string;
  docs: Record<string, unknown>[];
}

const couch = async (method: string, pathAndQuery: string, body?: unknown): Promise<Response> =>
  fetch(`${couchUrl}${pathAndQuery}`, {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const restoreFile = async (file: string): Promise<void> => {
  const backup = JSON.parse(await readFile(file, 'utf8')) as BackupFile;
  const dbPath = `/${encodeURIComponent(backup.db)}`;

  const created = await couch('PUT', dbPath);
  if (!created.ok && created.status !== 412) {
    throw new Error(`Could not create ${backup.db}: ${created.status}`);
  }

  for (let i = 0; i < backup.docs.length; i += CHUNK_SIZE) {
    const docs = backup.docs.slice(i, i + CHUNK_SIZE);
    const response = await couch('POST', `${dbPath}/_bulk_docs`, { docs, new_edits: false });
    if (!response.ok) {
      throw new Error(`Restoring ${backup.db} failed: ${response.status}`);
    }
  }
  console.log(`[restore] ${backup.db}: ${backup.docs.length} documents`);
};

const main = async (): Promise<void> => {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: restore.ts <backup folder>');
    process.exit(1);
  }
  const files = (await readdir(folder)).filter((name) => name.endsWith('.json'));
  for (const name of files) {
    await restoreFile(path.join(folder, name));
  }
};

main().catch((err: unknown) => {
  console.error(`[restore] Failed: ${(err as Error).message}`);
  process.exit(1);
});
