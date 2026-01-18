import { Router } from 'express';
import { HealthController } from '../controllers/HealthController';
import { asyncHandler } from '../middleware/error-handler';
import { DatabaseClient } from '../../lib/clients/database';
import { RedisClient } from '../../lib/clients/redis';

/**
 * Create health router
 */
export function createHealthRouter(database: DatabaseClient, redis: RedisClient): Router {
  const router = Router();
  const controller = new HealthController(database, redis);

  // GET /health - Basic liveness check
  router.get('/', asyncHandler(controller.liveness.bind(controller)));

  // GET /health/live - Liveness probe (for Kubernetes)
  router.get('/live', asyncHandler(controller.liveness.bind(controller)));

  // GET /health/ready - Readiness probe (for Kubernetes)
  router.get('/ready', asyncHandler(controller.readiness.bind(controller)));

  return router;
}

export default createHealthRouter;
