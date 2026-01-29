export type ReaderStatus = 'attached' | 'detached';

export interface TagEvent {
  type: 'tag';
  uid: string;
  ts: string;
  source: 'acr122u';
  device: string;
}

export interface ReaderEvent {
  type: 'reader';
  status: ReaderStatus;
  ts: string;
  source: 'acr122u';
  device: string;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  ts: string;
  source: 'acr122u';
  device: string;
}
