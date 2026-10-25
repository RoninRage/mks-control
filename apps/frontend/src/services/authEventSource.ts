import type {
  HeartbeatEvent,
  ShellyHealthEvent,
  ReaderErrorEvent,
  ReaderEvent,
  TagEvent,
  TerminalStateEvent,
} from '@mks-control/shared-types';
import { getEntranceKey } from 'src/utils/entranceConfig';
export type {
  HeartbeatEvent,
  ReaderErrorEvent,
  ReaderEvent,
  TagEvent,
  TagEventSource,
  TerminalStateEvent,
} from '@mks-control/shared-types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'retrying';

export interface AuthEventSource {
  connect(): void;
  disconnect(): void;
  onTag(callback: (event: TagEvent) => void): void;
  onReader(callback: (event: ReaderEvent) => void): void;
  onHeartbeat(callback: (event: HeartbeatEvent) => void): void;
  onReaderError(callback: (event: ReaderErrorEvent) => void): void;
  // A machine terminal's state changed; returns a function that removes the listener.
  onTerminalState(callback: (event: TerminalStateEvent) => void): () => void;
  // A Shelly went online or offline; returns a function that removes the listener.
  onShellyHealth(callback: (event: ShellyHealthEvent) => void): () => void;
  onStatus(cb: (status: ConnectionStatus) => void): void;
  onUnknownTag(callback: (event: TagEvent) => void): void;
  onInactiveUser(callback: (event: TagEvent) => void): void;
  emitUnknownTag(event: TagEvent): void;
  emitInactiveUser(event: TagEvent): void;
  setTagAssignmentMode(enabled: boolean): void;
  isInTagAssignmentMode(): boolean;
  // Entrance kiosk: true once the server accepted the entrance key on this connection.
  isEntrance(): boolean;
  onEntranceStatus(cb: (accepted: boolean) => void): () => void;
  // Connects again, e.g. after the entrance key was changed.
  reconnect(): void;
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

const isReaderErrorEvent = (value: unknown): value is ReaderErrorEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const event = value as ReaderErrorEvent;
  return (
    event.type === 'reader-error' &&
    typeof event.ts === 'string' &&
    typeof event.source === 'string' &&
    typeof event.device === 'string' &&
    typeof event.error === 'string'
  );
};

const isTerminalStateEvent = (value: unknown): value is TerminalStateEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const event = value as TerminalStateEvent;
  return (
    event.type === 'terminal-state' &&
    typeof event.terminalId === 'string' &&
    typeof event.ts === 'string'
  );
};

const isShellyHealthEvent = (value: unknown): value is ShellyHealthEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const event = value as ShellyHealthEvent;
  return (
    event.type === 'shelly-health' &&
    typeof event.deviceId === 'string' &&
    typeof event.health === 'string'
  );
};

const isHelloReply = (value: unknown): value is { type: 'hello'; entrance: boolean } =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: unknown }).type === 'hello' &&
  typeof (value as { entrance?: unknown }).entrance === 'boolean';

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
  private readonly readerErrorListeners: Array<(event: ReaderErrorEvent) => void> = [];
  private readonly statusListeners: Array<(status: ConnectionStatus) => void> = [];
  private readonly unknownTagListeners: Array<(event: TagEvent) => void> = [];
  private readonly inactiveUserListeners: Array<(event: TagEvent) => void> = [];
  private readonly terminalStateListeners: Array<(event: TerminalStateEvent) => void> = [];
  private readonly shellyHealthListeners: Array<(event: ShellyHealthEvent) => void> = [];
  private readonly entranceListeners: Array<(accepted: boolean) => void> = [];
  private entranceAccepted = false;

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
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.retryCount = 0;
      const entranceKey = getEntranceKey();
      if (entranceKey) {
        this.ws?.send(JSON.stringify({ type: 'hello', entranceKey }));
      }
      this.setStatus('connected');
    });

    this.ws.addEventListener('message', (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : '';
      if (!data) {
        return;
      }

      try {
        const parsed = JSON.parse(data) as unknown;
        if (isHelloReply(parsed)) {
          this.setEntrance(parsed.entrance);
          return;
        }
        if (isTagEvent(parsed)) {
          this.emitTag(parsed);
          return;
        }
        if (isReaderEvent(parsed)) {
          this.emitReader(parsed);
          return;
        }
        if (isReaderErrorEvent(parsed)) {
          this.emitReaderError(parsed);
          return;
        }
        if (isHeartbeatEvent(parsed)) {
          this.emitHeartbeat(parsed);
          return;
        }
        if (isTerminalStateEvent(parsed)) {
          this.terminalStateListeners.forEach((listener) => listener(parsed));
          return;
        }
        if (isShellyHealthEvent(parsed)) {
          this.shellyHealthListeners.forEach((listener) => listener(parsed));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    const socket = this.ws;
    socket.addEventListener('close', () => {
      // An old socket closing after reconnect() must not touch the new one.
      if (this.ws !== socket) {
        return;
      }
      this.ws = null;
      this.setEntrance(false);
      this.setStatus('disconnected');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    socket.addEventListener('error', () => {
      socket.close();
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

  public onReaderError(cb: (event: ReaderErrorEvent) => void): void {
    this.readerErrorListeners.push(cb);
  }

  public onTerminalState(cb: (event: TerminalStateEvent) => void): () => void {
    this.terminalStateListeners.push(cb);
    return () => {
      const index = this.terminalStateListeners.indexOf(cb);
      if (index >= 0) {
        this.terminalStateListeners.splice(index, 1);
      }
    };
  }

  public onShellyHealth(cb: (event: ShellyHealthEvent) => void): () => void {
    this.shellyHealthListeners.push(cb);
    return () => {
      const index = this.shellyHealthListeners.indexOf(cb);
      if (index >= 0) {
        this.shellyHealthListeners.splice(index, 1);
      }
    };
  }

  public onStatus(cb: (status: ConnectionStatus) => void): void {
    this.statusListeners.push(cb);
    cb(this.status);
  }

  public onUnknownTag(cb: (event: TagEvent) => void): void {
    this.unknownTagListeners.push(cb);
  }

  public onInactiveUser(cb: (event: TagEvent) => void): void {
    this.inactiveUserListeners.push(cb);
  }

  public emitUnknownTag(event: TagEvent): void {
    this.unknownTagListeners.forEach((listener: (event: TagEvent) => void) => listener(event));
  }

  public emitInactiveUser(event: TagEvent): void {
    this.inactiveUserListeners.forEach((listener: (event: TagEvent) => void) => listener(event));
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

  private emitReaderError(event: ReaderErrorEvent): void {
    this.readerErrorListeners.forEach((listener: (event: ReaderErrorEvent) => void) =>
      listener(event)
    );
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;

    // Expose connection status globally for E2E tests
    if (typeof window !== 'undefined') {
      (window as Window & { __WS_CONNECTED__?: boolean }).__WS_CONNECTED__ = status === 'connected';
    }

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

  public isEntrance(): boolean {
    return this.entranceAccepted;
  }

  public onEntranceStatus(cb: (accepted: boolean) => void): () => void {
    this.entranceListeners.push(cb);
    cb(this.entranceAccepted);
    return () => {
      const index = this.entranceListeners.indexOf(cb);
      if (index >= 0) {
        this.entranceListeners.splice(index, 1);
      }
    };
  }

  public reconnect(): void {
    const old = this.ws;
    this.ws = null;
    old?.close();
    this.setEntrance(false);
    this.connect();
  }

  private setEntrance(accepted: boolean): void {
    this.entranceAccepted = accepted;
    // Exposed for E2E tests, like __WS_CONNECTED__
    (window as Window & { __WS_ENTRANCE__?: boolean }).__WS_ENTRANCE__ = accepted;
    this.entranceListeners.forEach((listener) => listener(accepted));
  }

  public setTagAssignmentMode(enabled: boolean): void {
    this.isTagAssignmentMode = enabled;
  }

  public isInTagAssignmentMode(): boolean {
    return this.isTagAssignmentMode;
  }
}

export const authEventSource: AuthEventSource = new ServerWsAuthEventSource(resolveWsUrl());
