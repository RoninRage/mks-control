export type TagEventSource = 'acr122u' | 'webnfc' | 'manual';

export interface TagEvent {
  type: 'tag';
  uid: string;
  ts: string;
  source: TagEventSource;
  device: string;
  isAdmin?: boolean;
  memberFound?: boolean;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  ts: string;
  source: TagEventSource;
  device: string;
}

export type AuthEvent = TagEvent | HeartbeatEvent;
