import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import path from 'path';

// Nightly CouchDB backup. Saves every database as JSON through the CouchDB API (safe while
// CouchDB runs), one folder per day, and deletes folders older than BACKUP_KEEP_DAYS.
// Runs as the "couchdb-backup" service in docker-compose.prod.yml (backend image, other command).
// Restore: src/db/restore.ts. `--once` makes one backup and exits.

const couchUrl = (process.env.COUCHDB_URL ?? 'http://localhost:5984').replace(/\/+$/, '');
const user = process.env.COUCHDB_USER ?? 'admin';
const password = process.env.COUCHDB_PASSWORD ?? 'password';
const backupDir = process.env.BACKUP_DIR ?? '/backup';

const numberFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const keepDays = numberFromEnv('BACKUP_KEEP_DAYS', 30);
const backupHour = numberFromEnv('BACKUP_HOUR', 3) % 24;
const PAGE_SIZE = 1000;

const authHeader = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

const couch = async <T>(pathAndQuery: string): Promise<T> => {
  const response = await fetch(`${couchUrl}${pathAndQuery}`, {
    headers: { Authorization: authHeader },
  });
  if (!response.ok) {
    throw new Error(`CouchDB ${pathAndQuery} answered ${response.status}`);
  }
  return (await response.json()) as T;
};

interface AllDocsResponse {
  rows: Array<{ id: string; doc?: Record<string, unknown> }>;
}

const dumpDatabase = async (db: string): Promise<Record<string, unknown>[]> => {
  const docs: Record<string, unknown>[] = [];
  let startKey: string | undefined;
  for (;;) {
    const query = new URLSearchParams({
      include_docs: 'true',
      attachments: 'true',
      limit: String(PAGE_SIZE + 1),
    });
    if (startKey !== undefined) {
      query.set('startkey', JSON.stringify(startKey));
    }
    const page = await couch<AllDocsResponse>(`/${encodeURIComponent(db)}/_all_docs?${query}`);
    const rows = page.rows.slice(0, PAGE_SIZE);
    rows.forEach((row) => {
      if (row.doc) {
        docs.push(row.doc);
      }
    });
    if (page.rows.length <= PAGE_SIZE) {
      return docs;
    }
    startKey = page.rows[PAGE_SIZE].id;
  }
};

const todayFolder = (): string => new Date().toISOString().slice(0, 10);

const removeOldBackups = async (): Promise<void> => {
  if (keepDays === 0) {
    return;
  }
  const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10);
  const entries = await readdir(backupDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name) && entry.name < cutoff) {
      await rm(path.join(backupDir, entry.name), { recursive: true, force: true });
      console.log(`[backup] Removed old backup ${entry.name}`);
    }
  }
};

export const runBackup = async (): Promise<void> => {
  const databases = (await couch<string[]>('/_all_dbs')).filter((db) => !db.startsWith('_'));
  const folder = path.join(backupDir, todayFolder());
  await mkdir(folder, { recursive: true });

  for (const db of databases) {
    const docs = await dumpDatabase(db);
    await writeFile(path.join(folder, `${db}.json`), JSON.stringify({ db, docs }));
    console.log(`[backup] ${db}: ${docs.length} documents`);
  }
  await removeOldBackups();
  console.log(`[backup] Done: ${folder}`);
};

const msUntilNextRun = (): number => {
  const next = new Date();
  next.setHours(backupHour, 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - Date.now();
};

const scheduleNext = (): void => {
  const waitMs = msUntilNextRun();
  console.log(`[backup] Next backup at ${new Date(Date.now() + waitMs).toISOString()}`);
  setTimeout(() => {
    runBackup()
      .catch((err: unknown) => {
        console.error(`[backup] Failed: ${(err as Error).message}`);
      })
      .finally(scheduleNext);
  }, waitMs);
};

if (require.main === module) {
  if (process.argv.includes('--once')) {
    runBackup().catch((err: unknown) => {
      console.error(`[backup] Failed: ${(err as Error).message}`);
      process.exit(1);
    });
  } else {
    scheduleNext();
  }
}
