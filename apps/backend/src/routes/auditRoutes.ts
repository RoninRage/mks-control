import { Router, Request, Response } from 'express';
import { getAuditDatabase } from '../db/couchdb';
import { getDatabase } from '../db/couchdb';

const router = Router();

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
      auditLogs = auditLogs.filter((log: any) => {
        return (
          log.action?.toLowerCase().includes(searchLower) ||
          log.actorId?.toLowerCase().includes(searchLower) ||
          log.targetId?.toLowerCase().includes(searchLower) ||
          log.source?.toLowerCase().includes(searchLower)
        );
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

export default router;
