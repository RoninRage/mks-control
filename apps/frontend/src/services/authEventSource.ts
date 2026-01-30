export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'retrying';

export type TagEventSource = 'acr122u' | 'webnfc' | 'manual';

export type ReaderStatus = 'attached' | 'detached';

export interface TagEvent {
  type: 'tag';
  uid: string;
  ts: string;
  source: TagEventSource;
  device: string;
  isAdmin?: boolean;
  memberFound?: boolean;
  member?: {
    id: string;
    firstName: string;
    lastName: string;
    roles: string[];
  };
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
  source: string;
  device: string;
}

export interface AuthEventSource {
  connect(): void;
  disconnect(): void;
  onTag(callback: (event: TagEvent) => void): void;
  onReader(callback: (event: ReaderEvent) => void): void;
  onHeartbeat(callback: (event: HeartbeatEvent) => void): void;
  onStatus(cb: (status: ConnectionStatus) => void): void;
  onUnknownTag(callback: (event: TagEvent) => void): void;
  emitUnknownTag(event: TagEvent): void;
  setTagAssignmentMode(enabled: boolean): void;
  isInTagAssignmentMode(): boolean;
}

const resolveWsUrl = (): string => {
  const envUrl = process.env.AUTH_WS_URL;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }

  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const { hostname, port, host } = window.location;

    if (port && port !== '3000') {
      return `${protocol}://${hostname}:3000/ws/auth`;
    }

    return `${protocol}://${host}/ws/auth`;
  }

  return 'ws://localhost:3000/ws/auth';
};

const isTagEvent = (value: unknown): value is TagEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const event = value as TagEvent;
  return (
    event.type === 'tag' &&
    typeof event.uid === 'string' &&
    typeof event.ts === 'string' &&
    typeof event.source === 'string' &&
    typeof event.device === 'string'
    // isAdmin is optional, so we don't check it
  );
};

const isReaderEvent = (value: unknown): value is ReaderEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const event = value as ReaderEvent;
  return (
    event.type === 'reader' &&
    (event.status === 'attached' || event.status === 'detached') &&
    typeof event.ts === 'string' &&
    typeof event.source === 'string' &&
    typeof event.device === 'string'
  );
};

const isHeartbeatEvent = (value: unknown): value is HeartbeatEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const event = value as HeartbeatEvent;
  return (
    event.type === 'heartbeat' &&
    typeof event.ts === 'string' &&
    typeof event.source === 'string' &&
    typeof event.device === 'string'
  );
};

export class ServerWsAuthEventSource implements AuthEventSource {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectTimer: number | null = null;
  private retryCount = 0;
  private shouldReconnect = true;
  private isTagAssignmentMode = false;
  private readonly tagListeners: Array<(event: TagEvent) => void> = [];
  private readonly readerListeners: Array<(event: ReaderEvent) => void> = [];
  private readonly heartbeatListeners: Array<(event: HeartbeatEvent) => void> = [];
  private readonly statusListeners: Array<(status: ConnectionStatus) => void> = [];
  private readonly unknownTagListeners: Array<(event: TagEvent) => void> = [];

  public constructor(private readonly url: string) {}

  public connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.shouldReconnect = true;
    this.clearReconnectTimer();
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (error) {
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.retryCount = 0;
      this.setStatus('connected');
    });

    this.ws.addEventListener('message', (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : '';
      if (!data) {
        return;
      }

      try {
        const parsed = JSON.parse(data) as unknown;
        if (isTagEvent(parsed)) {
          console.log('[authEventSource] Tag event received:', parsed);
          this.emitTag(parsed);
          return;
        }
        if (isReaderEvent(parsed)) {
          this.emitReader(parsed);
          return;
        }
        if (isHeartbeatEvent(parsed)) {
          this.emitHeartbeat(parsed);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.addEventListener('close', () => {
      this.ws = null;
      this.setStatus('disconnected');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener('error', () => {
      this.ws?.close();
    });
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  public onTag(cb: (event: TagEvent) => void): void {
    this.tagListeners.push(cb);
  }

  public onReader(cb: (event: ReaderEvent) => void): void {
    this.readerListeners.push(cb);
  }

  public onHeartbeat(cb: (event: HeartbeatEvent) => void): void {
    this.heartbeatListeners.push(cb);
  }

  public onStatus(cb: (status: ConnectionStatus) => void): void {
    this.statusListeners.push(cb);
    cb(this.status);
  }

  public onUnknownTag(cb: (event: TagEvent) => void): void {
    this.unknownTagListeners.push(cb);
  }

  public emitUnknownTag(event: TagEvent): void {
    this.unknownTagListeners.forEach((listener: (event: TagEvent) => void) => listener(event));
  }

  private emitTag(event: TagEvent): void {
    this.tagListeners.forEach((listener: (event: TagEvent) => void) => listener(event));
  }

  private emitReader(event: ReaderEvent): void {
    this.readerListeners.forEach((listener: (event: ReaderEvent) => void) => listener(event));
  }

  private emitHeartbeat(event: HeartbeatEvent): void {
    this.heartbeatListeners.forEach((listener: (event: HeartbeatEvent) => void) => listener(event));
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener: (status: ConnectionStatus) => void) =>
      listener(status)
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }

    this.retryCount += 1;
    const delay = Math.min(10000, 1000 * 2 ** (this.retryCount - 1));
    this.setStatus('retrying');

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public setTagAssignmentMode(enabled: boolean): void {
    this.isTagAssignmentMode = enabled;
    console.log('[authEventSource] Tag assignment mode:', enabled);
  }

  public isInTagAssignmentMode(): boolean {
    return this.isTagAssignmentMode;
  }
}

export const authEventSource: AuthEventSource = new ServerWsAuthEventSource(resolveWsUrl());
