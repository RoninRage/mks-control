export interface AuditLog {
  _id?: string;
  _rev?: string;
  id: string;
  action: string;
  actorId?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  relatedId?: string; // Additional context (e.g., member ID for permission updates)
  timestamp: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
  source?: string;
}

export interface AuditLogFilters {
  startDate?: string;
  endDate?: string;
  action?: string;
  userId?: string;
  source?: string;
  targetId?: string;
  search?: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  metadata: {
    total: number;
    sources: string[];
    actions: string[];
  };
}

interface ClearAuditLogsResponse {
  ok: boolean;
  deleted: number;
}

const resolveApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, port } = window.location;

    if (port && port !== '3000') {
      return `http://${hostname}:3000/api`;
    }

    return '/api';
  }

  return 'http://localhost:3000/api';
};

export const auditService = {
  async getAuditLogs(filters?: AuditLogFilters): Promise<AuditLogsResponse> {
    try {
      const apiUrl = resolveApiUrl();
      const url = new URL(`${apiUrl}/audit-logs`);

      // Add query parameters for filters
      if (filters?.startDate) {
        url.searchParams.append('startDate', filters.startDate);
      }
      if (filters?.endDate) {
        url.searchParams.append('endDate', filters.endDate);
      }
      if (filters?.action) {
        url.searchParams.append('action', filters.action);
      }
      if (filters?.userId) {
        url.searchParams.append('userId', filters.userId);
      }
      if (filters?.source) {
        url.searchParams.append('source', filters.source);
      }
      if (filters?.targetId) {
        url.searchParams.append('targetId', filters.targetId);
      }
      if (filters?.search) {
        url.searchParams.append('search', filters.search);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs: ' + response.statusText);
      }

      return (await response.json()) as AuditLogsResponse;
    } catch (error) {
      console.error('[auditService] Error fetching audit logs:', error);
      throw error;
    }
  },

  async clearAuditLogs(): Promise<ClearAuditLogsResponse> {
    try {
      const apiUrl = resolveApiUrl();
      const response = await fetch(`${apiUrl}/audit-logs`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to clear audit logs: ' + response.statusText);
      }

      return (await response.json()) as ClearAuditLogsResponse;
    } catch (error) {
      console.error('[auditService] Error clearing audit logs:', error);
      throw error;
    }
  },
};
