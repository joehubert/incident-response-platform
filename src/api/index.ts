export { createApiRouter } from './routes';
export type { ApiDependencies } from './routes';

// Middleware exports
export {
  authenticateApiKey,
  generateApiKey,
  hashApiKey,
  requirePermission,
} from './middleware/auth';
export { validateRequest, paginationSchema, uuidSchema } from './middleware/validation';
export { errorHandler, notFoundHandler, asyncHandler } from './middleware/error-handler';
export { requestLogger } from './middleware/request-logger';

// Controller exports
export { IncidentsController } from './controllers/IncidentsController';
export { MonitorsController } from './controllers/MonitorsController';
export { HealthController } from './controllers/HealthController';
