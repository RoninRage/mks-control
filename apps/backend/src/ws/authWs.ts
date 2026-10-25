import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { isEntranceKey } from '../auth/keys';
import type { AuthEvent, WsHelloReply } from '../types/auth';

type ClientSocket = WebSocket & { isAlive?: boolean; isEntrance?: boolean };

interface AuthWsContext {
  wss: WebSocketServer;
  broadcast: (event: AuthEvent) => void;
  getClientCount: () => number;
}

// Events from the entrance reader (scans with login codes, reader status) only go to the kiosk
// at the entrance: sockets that sent {type:'hello', entranceKey} with the right key.
// Status notices without personal data (terminal-state, shelly-health) go to everyone.
const ENTRANCE_ONLY: ReadonlySet<AuthEvent['type']> = new Set<AuthEvent['type']>([
  'tag',
  'heartbeat',
  'reader-error',
  'reader',
]);

const isHello = (value: unknown): value is { type: 'hello'; entranceKey?: unknown } =>
  typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'hello';

export const setupAuthWs = (server: http.Server): AuthWsContext => {
  const wss = new WebSocketServer({ server, path: '/ws/auth', maxPayload: 4096 });

  const broadcast = (event: AuthEvent): void => {
    const data = JSON.stringify(event);
    const entranceOnly = ENTRANCE_ONLY.has(event.type);
    wss.clients.forEach((client: WebSocket) => {
      const socket = client as ClientSocket;
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (entranceOnly && !socket.isEntrance) {
        return;
      }
      socket.send(data);
    });
  };

  const getClientCount = (): number => wss.clients.size;

  wss.on('connection', (ws: ClientSocket) => {
    ws.isAlive = true;
    ws.isEntrance = false;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isHello(message)) {
        return;
      }
      const key = typeof message.entranceKey === 'string' ? message.entranceKey : '';
      ws.isEntrance = isEntranceKey(key);
      const reply: WsHelloReply = { type: 'hello', entrance: ws.isEntrance };
      ws.send(JSON.stringify(reply));
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
      const ws = client as ClientSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return { wss, broadcast, getClientCount };
};
