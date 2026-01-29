export type TagEventSource = 'acr122u' | 'webnfc' | 'manual';

export interface TagEvent {
  type: 'tag';
  uid: string;
  ts: string;
  source: TagEventSource;
  device: string;
}
