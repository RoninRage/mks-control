export type TagEventSource = 'acr122u' | 'webnfc' | 'manual';

export type ReaderStatus = 'attached' | 'detached';

export interface TagEvent {
  type: 'tag';
  uid: string;
  ts: string;
  source: TagEventSource;
  device: string;
  isAdmin?: boolean;
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

export type AuthEvent = TagEvent | ReaderEvent | HeartbeatEvent;
