import { Router } from 'express';
import { MonitorsController } from '../controllers/MonitorsController';
import { validateRequest, uuidSchema } from '../middleware/validation';
import { asyncHandler } from '../middleware/error-handler';
import { MonitorManager } from '../../services/detection';

/**
 * Create monitors router
 */
export function createMonitorsRouter(monitorManager: MonitorManager): Router {
  const router = Router();
  const controller = new MonitorsController(monitorManager);

  // GET /monitors - List all monitors
  router.get('/', asyncHandler(controller.list.bind(controller)));

  // GET /monitors/status - Get monitor status
  router.get('/status', asyncHandler(controller.getStatus.bind(controller)));

  // POST /monitors/reload - Reload monitor configuration
  router.post('/reload', asyncHandler(controller.reload.bind(controller)));

  // GET /monitors/:id - Get monitor by ID
  router.get(
    '/:id',
    validateRequest({
      params: uuidSchema,
    }),
    asyncHandler(controller.get.bind(controller))
  );

  return router;
}

export default createMonitorsRouter;
