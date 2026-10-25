import { getUsageDatabase } from '../db/couchdb';

// Usages are personal data: ended usages are deleted after USAGE_RETENTION_DAYS
// (default 365, like the audit log). Open usages (running machines) are never deleted.

const retentionDays = (): number => Number(process.env.USAGE_RETENTION_DAYS ?? 365);
const cleanupIntervalMs = (): number => Number(process.env.USAGE_CLEANUP_INTERVAL_MS ?? 86_400_000);

export const purgeOldUsages = async (): Promise<number> => {
  const days = retentionDays();
  if (!Number.isFinite(days) || days <= 0) {
    return 0;
  }
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = getUsageDatabase();
  let deleted = 0;

  while (true) {
    const result = await db.find({
      selector: { type: { $eq: 'equipmentUsage' }, endedAt: { $lt: cutoff } },
      limit: 500,
    });
    if (result.docs.length === 0) {
      break;
    }
    await db.bulk({
      docs: result.docs.map((doc) => ({ _id: doc._id, _rev: doc._rev, _deleted: true })),
    });
    deleted += result.docs.length;
  }
  return deleted;
};

export const scheduleUsageRetentionCleanup = (): void => {
  const run = (): void => {
    purgeOldUsages().catch((err) => console.error('[usage] Retention cleanup failed:', err));
  };
  run();
  const interval = cleanupIntervalMs();
  if (Number.isFinite(interval) && interval > 0) {
    setInterval(run, interval).unref();
  }
};
