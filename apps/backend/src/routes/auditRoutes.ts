import { Router, Request, Response } from 'express';
import { getAuditDatabase } from '../db/couchdb';
import { getDatabase } from '../db/couchdb';
import { logAuditEvent } from '../db/audit';

const router = Router();

const deleteAllAuditLogs = async (): Promise<number> => {
  const auditDb = getAuditDatabase();
  const batchSize = 500;
  let deletedCount = 0;
  let startKey: string | undefined;

  while (true) {
    const result = await auditDb.list({
      include_docs: true,
      limit: batchSize,
      startkey: startKey,
      skip: startKey ? 1 : 0,
    });

    if (result.rows.length === 0) {
      break;
    }

    const deletions = result.rows
      .filter((row) => !row.id.startsWith('_design/') && !row.id.startsWith('_local/'))
      .map((row) => ({
        _id: row.id,
        _rev: row.doc?._rev,
        _deleted: true,
      }))
      .filter((doc) => Boolean(doc._rev));

    if (deletions.length > 0) {
      await auditDb.bulk({ docs: deletions });
      deletedCount += deletions.length;
    }

    startKey = result.rows[result.rows.length - 1]?.id;
    if (!startKey || result.rows.length < batchSize) {
      break;
    }
  }

  return deletedCount;
};

interface AuditLogFilter {
  startDate?: string;
  endDate?: string;
  action?: string;
  userId?: string;
  source?: string;
  targetId?: string;
  search?: string;
}

/**
 * GET /api/audit-logs
 * Get audit logs with role-based filtering
 * Admin/Vorstand: See all logs
 * Bereichsleitung: See only auth.login/logout events for members in their areas
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userRole = req.get('x-user-role') as string | undefined;
    const userId = req.get('x-user-id') as string | undefined;

    // Debug logging
    console.log('🔍 auditRoutes: Received headers:', {
      'x-user-role': userRole,
      'x-user-id': userId,
      'x-source': req.get('x-source'),
      'all-headers': req.headers,
    });

    // Only admins, vorstand, and bereichsleitung can view audit logs
    if (!['admin', 'vorstand', 'bereichsleitung'].includes(userRole || '')) {
      console.warn('❌ Audit access denied: userRole=%s (not in allowed list)', userRole);
      res.status(403).json({ error: 'Insufficient permissions to view audit logs' });
      return;
    }

    // Parse query parameters for filtering
    const {
      startDate,
      endDate,
      action,
      userId: filterUserId,
      source,
      targetId,
      search,
    } = req.query as Record<string, string | undefined>;

    const auditDb = getAuditDatabase();
    const membersDb = getDatabase();

    // Build selector for base query
    const selector: Record<string, any> = {};

    // Date range filtering
    if (startDate || endDate) {
      selector.timestamp = {};
      if (startDate) selector.timestamp.$gte = startDate;
      if (endDate) selector.timestamp.$lte = endDate;
    }

    // Action filtering
    if (action) {
      selector.action = { $eq: action };
    }

    // User ID filtering
    if (filterUserId) {
      selector.actorId = { $eq: filterUserId };
    }

    // Source (machine) filtering
    if (source) {
      selector.source = { $eq: source };
    }

    // Target ID (entity) filtering
    if (targetId) {
      selector.targetId = { $eq: targetId };
    }

    // Fetch audit logs
    let logs = await auditDb.find({
      selector:
        selector.action ||
        selector.timestamp ||
        selector.actorId ||
        selector.source ||
        selector.targetId
          ? selector
          : { action: { $exists: true } },
      sort: [{ timestamp: 'desc' }],
    });

    let auditLogs = logs.docs;

    // Role-based filtering for Bereichsleitung
    if (userRole === 'bereichsleitung' && userId) {
      // Get areas managed by this user
      const areasResult = await membersDb.find({
        selector: { type: { $eq: 'area' } },
      });

      const managedAreas = areasResult.docs.filter(
        (area: any) =>
          area.bereichsleiterIds && (area.bereichsleiterIds as string[]).includes(userId)
      );

      const managedAreaIds = managedAreas.map((area: any) => area.id);

      // Get members in those areas
      const membersResult = await membersDb.find({
        selector: {
          areaId: { $in: managedAreaIds },
        },
      });

      const managedMemberIds = membersResult.docs.map((member: any) => member.id);

      // Filter logs: only auth events for managed members
      auditLogs = auditLogs.filter(
        (log: any) =>
          (log.action === 'auth.login' ||
            log.action === 'auth.login.inactive' ||
            log.action === 'auth.login.admin-tag' ||
            log.action === 'auth.login.invalid' ||
            log.action === 'auth.logout') &&
          managedMemberIds.includes(log.actorId)
      );
    }

    // Full-text search filtering
    if (search) {
      const searchLower = search.toLowerCase();
      let matchingEquipmentIds: string[] = [];

      if (searchLower.trim().length > 0) {
        const equipmentResult = await membersDb.find({
          selector: { type: { $eq: 'equipment' } },
        });

        matchingEquipmentIds = equipmentResult.docs
          .filter((item: any) => {
            const idMatch = (item.id || '').toLowerCase() === searchLower;
            const nameMatch = (item.name || '').toLowerCase().includes(searchLower);
            return idMatch || nameMatch;
          })
          .map((item: any) => item.id);
      }

      auditLogs = auditLogs.filter((log: any) => {
        const directMatch =
          log.action?.toLowerCase().includes(searchLower) ||
          log.actorId?.toLowerCase().includes(searchLower) ||
          log.targetId?.toLowerCase().includes(searchLower) ||
          log.relatedId?.toLowerCase().includes(searchLower) ||
          log.source?.toLowerCase().includes(searchLower);

        if (directMatch) {
          return true;
        }

        if (matchingEquipmentIds.length === 0) {
          return false;
        }

        const targetMatch =
          log.targetType === 'equipment' &&
          log.targetId &&
          matchingEquipmentIds.includes(log.targetId);
        const relatedMatch = log.relatedId && matchingEquipmentIds.includes(log.relatedId);
        return targetMatch || relatedMatch;
      });
    }

    // Get list of unique machines (sources) from logs for frontend filter dropdown
    const uniqueSources = Array.from(
      new Set(
        logs.docs
          .map((log: any) => log.source)
          .filter((source: any) => source !== undefined && source !== null)
      )
    ).sort() as string[];

    // Get list of unique actions from logs for frontend filter dropdown
    const uniqueActions = Array.from(
      new Set(logs.docs.map((log: any) => log.action).filter((action: any) => action !== undefined))
    ).sort() as string[];

    res.json({
      logs: auditLogs,
      metadata: {
        total: auditLogs.length,
        sources: uniqueSources,
        actions: uniqueActions,
      },
    });
  } catch (error) {
    console.error('[audit-routes] Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * DELETE /api/audit-logs
 * Clear all audit logs (admin only)
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    const userRole = req.get('x-user-role') as string | undefined;

    if (userRole !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions to clear audit logs' });
      return;
    }

    const deleted = await deleteAllAuditLogs();

    await logAuditEvent(
      {
        action: 'audit.clear',
        targetType: 'audit',
        targetId: 'all',
      },
      req
    );

    res.json({ ok: true, deleted });
  } catch (error) {
    console.error('[audit-routes] Error clearing audit logs:', error);
    res.status(500).json({ error: 'Failed to clear audit logs' });
  }
});

export default router;
