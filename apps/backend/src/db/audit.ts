import type { Request } from 'express';
import { nanoid } from 'nanoid';
import { getAuditDatabase } from './couchdb';
import type { AuditLog, AuditLogInput } from '../types/audit';
import { currentMemberId, currentRole } from '../auth/middleware';

const retentionDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);
const cleanupIntervalMs = Number(process.env.AUDIT_CLEANUP_INTERVAL_MS ?? 86_400_000);

const buildAuditEntry = (input: AuditLogInput, req?: Request): AuditLog => {
  const now = new Date().toISOString();
  // Actor and role come from the login session, never from client headers.
  const actorId = input.actorId ?? (req ? currentMemberId(req) : undefined);
  const actorRole = input.actorRole ?? (req ? currentRole(req) : undefined);
  const source = input.source ?? req?.get('x-source') ?? process.env.MACHINE_NAME ?? undefined;

  return {
    id: nanoid(),
    action: input.action,
    actorId,
    actorRole,
    targetType: input.targetType,
    targetId: input.targetId,
    relatedId: input.relatedId,
    timestamp: now,
    ip: req?.ip,
    userAgent: req?.get('user-agent') ?? undefined,
    deviceId: req?.get('x-device-id') ?? undefined,
    source,
  };
};

export const logAuditEvent = async (input: AuditLogInput, req?: Request): Promise<void> => {
  try {
    const db = getAuditDatabase();
    const entry = buildAuditEntry(input, req);
    await db.insert(entry);
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
};

const purgeAuditLogsOlderThan = async (cutoffIso: string): Promise<number> => {
  const db = getAuditDatabase();
  let deletedCount = 0;

  while (true) {
    const result = await db.find({
      selector: { timestamp: { $lt: cutoffIso } },
      limit: 500,
    });

    if (result.docs.length === 0) {
      break;
    }

    const deletions = result.docs.map((doc) => ({
      _id: doc._id,
      _rev: doc._rev,
      _deleted: true,
    }));

    await db.bulk({ docs: deletions });
    deletedCount += result.docs.length;
  }

  return deletedCount;
};

export const scheduleAuditRetentionCleanup = (): void => {
  if (Number.isNaN(retentionDays) || retentionDays <= 0) {
    return;
  }

  const runCleanup = async (): Promise<void> => {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    try {
      await purgeAuditLogsOlderThan(cutoff);
    } catch (err) {
      console.error('[audit] Failed retention cleanup:', err);
    }
  };

  void runCleanup();
  setInterval(runCleanup, cleanupIntervalMs);
};
