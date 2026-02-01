export interface TagEvent {
  type: 'tag';
  uid: string;
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

export interface ReaderErrorEvent {
  type: 'reader-error';
  ts: string;
  source: 'acr122u';
  device: string;
  error: string;
}
