export type TagEventSource = 'acr122u' | 'webnfc' | 'manual';

export type ReaderStatus = 'attached' | 'detached';

export interface MemberSummary {
  id: string;
  firstName: string;
  lastName: string;
  roles: string[];
  preferredTheme?: 'light' | 'dark' | 'auto';
}

export interface TagEvent {
  type: 'tag';
  uid: string;
  ts: string;
  source: TagEventSource;
  device: string;
  isAdmin?: boolean;
  memberFound?: boolean;
  isInactive?: boolean;
  member?: MemberSummary;
}

export interface ReaderEvent {
  type: 'reader';
  status: ReaderStatus;
  ts: string;
  source: TagEventSource;
  device: string;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  ts: string;
  source: TagEventSource;
  device: string;
}

export interface ReaderErrorEvent {
  type: 'reader-error';
  ts: string;
  source: TagEventSource;
  device: string;
  error: string;
}

export type AuthEvent = TagEvent | ReaderEvent | HeartbeatEvent | ReaderErrorEvent;

export interface Area {
  _id?: string;
  _rev?: string;
  type?: 'area';
  id: string;
  name: string;
  description: string;
  bereichsleiterIds?: string[];
  isActive?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AreaWithMeta extends Area {
  _id: string;
  _rev: string;
}

export interface Equipment {
  _id?: string;
  _rev?: string;
  type?: 'equipment';
  id: string;
  name: string;
  configuration?: string;
  areaId?: string;
  isAvailable: boolean;
  isActive?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EquipmentWithMeta extends Equipment {
  _id: string;
  _rev: string;
}

export interface Tag {
  _id?: string;
  _rev?: string;
  id: string;
  tagUid: string;
  memberId: string;
  createdAt?: string;
  updatedAt?: string;
  isActive: boolean;
}

export interface CreateTagRequest {
  tagUid: string;
  memberId: string;
}

export interface Member {
  _id?: string;
  _rev?: string;
  id: string;
  // Business membership number from the Vereinsplaner (e.g. "[A]-1006"), distinct from the
  // CouchDB-internal `id`. Used as the upsert key for the CSV member import.
  memberId?: string;
  firstName: string;
  lastName: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles: string[];
  joinDate: string;
  isActive: boolean;
  preferredTheme?: 'light' | 'dark' | 'auto';
  equipmentPermissions?: Record<string, boolean>;
  tags?: Tag[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMemberRequest {
  firstName: string;
  lastName: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles?: string[];
}

export interface UpdateMemberRequest {
  firstName?: string;
  lastName?: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles?: string[];
  preferredTheme?: 'light' | 'dark' | 'auto';
  isActive?: boolean;
  equipmentPermissions?: Record<string, boolean>;
}

// Per-row failure reported by the CSV member import (POST /api/members/import).
export interface MemberImportError {
  row: number;
  memberId: string;
  reason: string;
}

// Result returned by the CSV member import endpoint.
export interface MemberImportResult {
  success: boolean;
  summary: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
  };
  errors: MemberImportError[];
}
