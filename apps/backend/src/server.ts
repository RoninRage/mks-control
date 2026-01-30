import 'dotenv/config';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createAuthRoutes } from './routes/authRoutes';
import { createMemberRoutes } from './routes/memberRoutes';
import { setupAuthWs } from './ws/authWs';
import { initializeDatabase } from './db/couchdb';
import { seedMembers } from './db/seedMembers';

// Enforce monorepo dev entry point
if (process.env.MONOREPO_DEV !== 'true') {
  console.error('❌ ERROR: Backend must be started via: npm run dev');
  console.error('Do not run backend directly');
  process.exit(1);
}

const startServer = async (): Promise<void> => {
  // Initialize database
  await initializeDatabase();
  await seedMembers();

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
};

startServer().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
