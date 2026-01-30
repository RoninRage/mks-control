import 'dotenv/config';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createAuthRoutes } from './routes/authRoutes';
import { createMemberRoutes } from './routes/memberRoutes';
import { setupAuthWs } from './ws/authWs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

const server = http.createServer(app);
const { broadcast, getClientCount } = setupAuthWs(server);

app.use('/api/auth', createAuthRoutes(broadcast));
app.use('/api', createMemberRoutes());

console.log('[server] Routes registered: /api/auth and /api/members');

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);

server.listen(port, () => {
  console.log(`[auth-gateway] listening on http://localhost:${port}`);
  console.log(`[auth-gateway] ws clients: ${getClientCount()}`);
});
