import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthEvent } from '../types/auth';

type AliveWebSocket = WebSocket & { isAlive?: boolean };

interface AuthWsContext {
  wss: WebSocketServer;
  broadcast: (event: AuthEvent) => void;
  getClientCount: () => number;
}

export const setupAuthWs = (server: http.Server): AuthWsContext => {
  const wss = new WebSocketServer({ server, path: '/ws/auth' });

  const broadcast = (event: AuthEvent): void => {
    const data = JSON.stringify(event);
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  const getClientCount = (): number => wss.clients.size;

  wss.on('connection', (ws: AliveWebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    console.log(`[auth-ws] client connected (${getClientCount()})`);

    ws.on('close', () => {
      console.log(`[auth-ws] client disconnected (${getClientCount()})`);
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
      const ws = client as AliveWebSocket;
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
