import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Auto-detect test environment by checking for .env.test file
// This allows E2E tests to run without modifying production code
const cwdTestEnvPath = resolve(process.cwd(), '.env.test');
const repoRootTestEnvPath = resolve(__dirname, '..', '..', '..', '.env.test');
const testEnvPath = existsSync(cwdTestEnvPath) ? cwdTestEnvPath : repoRootTestEnvPath;

if (existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath });
  process.env.NODE_ENV = 'test'; // Ensure NODE_ENV is set for test mode
  console.log('[server] 🧪 Test mode detected - loaded .env.test');
} else {
  dotenv.config();
  console.log('[server] 📦 Production/dev mode - loaded .env');
}

import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createAuthRoutes } from './routes/authRoutes';
import { createMemberRoutes } from './routes/memberRoutes';
import { createTagRoutes } from './routes/tagRoutes';
import areaRoutes from './routes/areaRoutes';
import equipmentRoutes from './routes/equipmentRoutes';
import auditRoutes from './routes/auditRoutes';
import { setupAuthWs } from './ws/authWs';
import { initializeDatabase } from './db/couchdb';
import { seedMembers } from './db/seedMembers';
import { seedAreas } from './db/seedAreas';
import { seedEquipment } from './db/seedEquipment';
import { getSeedCountsFromEnv, seedMassData } from './db/seedMass';
import { migrateDocTypes, migrateTagsToCollection } from './db/migrations';
import { migrateBackupAdmin } from './db/migrateBackupAdmin';
import { scheduleAuditRetentionCleanup } from './db/audit';

// Enforce monorepo dev entry point
if (process.env.MONOREPO_DEV !== 'true') {
  console.error('❌ ERROR: Backend must be started via: npm run dev');
  console.error('Do not run backend directly');
  process.exit(1);
}

const startServer = async (): Promise<void> => {
  // Initialize database
  await initializeDatabase();
  scheduleAuditRetentionCleanup();
  await migrateDocTypes();
  await migrateBackupAdmin();
  if (process.env.SEED_DATA === 'true') {
    if (process.env.SEED_MODE === 'mass') {
      await seedMassData(getSeedCountsFromEnv());
    } else {
      await seedAreas();
      await seedEquipment();
      await seedMembers();
    }
  }
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
  app.use('/api/audit-logs', auditRoutes);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  const port = Number(process.env.PORT ?? 3000);

  server.listen(port, () => {
    // Server started
  });
};

startServer().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
