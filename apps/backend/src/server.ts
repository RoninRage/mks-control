import 'dotenv/config';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createAuthRoutes } from './routes/authRoutes';
import { createMemberRoutes } from './routes/memberRoutes';
import { createTagRoutes } from './routes/tagRoutes';
import areaRoutes from './routes/areaRoutes';
import equipmentRoutes from './routes/equipmentRoutes';
import { setupAuthWs } from './ws/authWs';
import { initializeDatabase } from './db/couchdb';
import { seedMembers } from './db/seedMembers';
import { seedAreas } from './db/seedAreas';
import { seedEquipment } from './db/seedEquipment';
import { migrateTagsToCollection } from './db/migrations';

// Enforce monorepo dev entry point
if (process.env.MONOREPO_DEV !== 'true') {
  console.error('❌ ERROR: Backend must be started via: npm run dev');
  console.error('Do not run backend directly');
  process.exit(1);
}

const startServer = async (): Promise<void> => {
  // Initialize database
  await initializeDatabase();
  await seedAreas();
  await seedEquipment();
  await seedMembers();
  await migrateTagsToCollection();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  const server = http.createServer(app);
  const { broadcast, getClientCount } = setupAuthWs(server);

  app.use('/api/auth', createAuthRoutes(broadcast));
  app.use('/api', createMemberRoutes());
  app.use('/api', createTagRoutes());
  app.use('/api/areas', areaRoutes);
  app.use('/api/equipment', equipmentRoutes);

  console.log(
    '[server] Routes registered: /api/auth, /api/members, /api/tags, /api/areas, /api/equipment'
  );

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
