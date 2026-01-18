import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './lib/utils/logger';
import { register as metricsRegister } from './lib/utils/metrics';
import { DetectionService, MonitorManager } from './services/detection';
import { DatadogClient } from './lib/clients/datadog';
import { DatabaseClient } from './lib/clients/database';
import { RedisClient } from './lib/clients/redis';
import { createApiRouter } from './api/routes';
import { authenticateApiKey, errorHandler, notFoundHandler, requestLogger } from './api/middleware';

let detectionService: DetectionService | null = null;
let database: DatabaseClient | null = null;
let redis: RedisClient | null = null;
let monitorManager: MonitorManager | null = null;

export async function startServer() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use(requestLogger);

  // Rate limiting for API routes
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    },
  });

  // Initialize database
  database = new DatabaseClient();
  await database.connect();

  // Initialize Redis
  redis = new RedisClient();
  await redis.connect();

  // Initialize Monitor Manager
  monitorManager = new MonitorManager(config.monitoring.configPath);
  await monitorManager.loadMonitors();

  // Initialize Detection Service
  const datadog = new DatadogClient();
  detectionService = new DetectionService(datadog, redis, database);
  await detectionService.start();

  // Public endpoints (no auth required)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  });

  // API routes (protected with API key auth)
  const apiRouter = createApiRouter({
    database,
    redis,
    monitorManager,
  });

  app.use('/api/v1', apiLimiter, authenticateApiKey, apiRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await detectionService?.stop();
    await database?.disconnect();
    await redis?.disconnect();
    process.exit(0);
  });

  // Start server
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(config.server.port, () => {
      logger.info(`Server listening on port ${config.server.port}`);
      resolve();
    });

    server.on('error', reject);
  });
}
