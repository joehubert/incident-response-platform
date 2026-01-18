import { Router } from 'express';
import { z } from 'zod';
import { IncidentsController } from '../controllers/IncidentsController';
import { validateRequest, paginationSchema, uuidSchema, incidentStatusSchema, severitySchema } from '../middleware/validation';
import { asyncHandler } from '../middleware/error-handler';
import { DatabaseClient } from '../../lib/clients/database';

/**
 * Create incidents router
 */
export function createIncidentsRouter(database: DatabaseClient): Router {
  const router = Router();
  const controller = new IncidentsController(database);

  // GET /incidents - List incidents
  router.get(
    '/',
    validateRequest({
      query: paginationSchema.extend({
        status: incidentStatusSchema.optional(),
        severity: severitySchema.optional(),
        monitorId: z.string().optional(),
      }),
    }),
    asyncHandler(controller.list.bind(controller))
  );

  // GET /incidents/stats - Get incident statistics
  router.get('/stats', asyncHandler(controller.getStats.bind(controller)));

  // GET /incidents/:id - Get incident by ID
  router.get(
    '/:id',
    validateRequest({
      params: uuidSchema,
    }),
    asyncHandler(controller.get.bind(controller))
  );

  // PATCH /incidents/:id - Update incident
  router.patch(
    '/:id',
    validateRequest({
      params: uuidSchema,
      body: z.object({
        status: incidentStatusSchema.optional(),
        investigationTier: z.enum(['tier1', 'tier2', 'tier3']).optional(),
      }),
    }),
    asyncHandler(controller.update.bind(controller))
  );

  return router;
}

export default createIncidentsRouter;
