import { Router } from 'express';
import { createIncidentsRouter } from './incidents';
import { createMonitorsRouter } from './monitors';
import { createHealthRouter } from './health';
import { DatabaseClient } from '../../lib/clients/database';
import { RedisClient } from '../../lib/clients/redis';
import { MonitorManager } from '../../services/detection';

/**
 * Dependencies for API routes
 */
export interface ApiDependencies {
  database: DatabaseClient;
  redis: RedisClient;
  monitorManager: MonitorManager;
}

/**
 * Create all API routes
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const router = Router();

  // Mount route modules
  router.use('/incidents', createIncidentsRouter(deps.database));
  router.use('/monitors', createMonitorsRouter(deps.monitorManager));
  router.use('/health', createHealthRouter(deps.database, deps.redis));

  return router;
}

export { createIncidentsRouter } from './incidents';
export { createMonitorsRouter } from './monitors';
export { createHealthRouter } from './health';
