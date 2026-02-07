export interface AuditLog {
  _id?: string;
  _rev?: string;
  id: string;
  action: string;
  actorId?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
  source?: string;
}

export interface AuditLogInput {
  action: string;
  actorId?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  source?: string;
}
