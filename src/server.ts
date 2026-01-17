import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { logger } from './lib/utils/logger';
import { register as metricsRegister } from './lib/utils/metrics';
import { DetectionService } from './services/detection';
import { DatadogClient } from './lib/clients/datadog';
import { DatabaseClient } from './lib/clients/database';
import { RedisClient } from './lib/clients/redis';

let detectionService: DetectionService | null = null;
let database: DatabaseClient | null = null;
let redis: RedisClient | null = null;

export async function startServer() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Initialize database
  database = new DatabaseClient();
  await database.connect();

  // Initialize Redis
  redis = new RedisClient();
  await redis.connect();

  // Initialize Detection Service
  const datadog = new DatadogClient();
  detectionService = new DetectionService(datadog, redis, database);
  await detectionService.start();

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Metrics endpoint
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  });

  // Reload monitors endpoint (for hot reload)
  app.post('/api/v1/monitors/reload', async (_req, res) => {
    try {
      await detectionService?.reloadMonitors();
      res.json({ success: true, message: 'Monitors reloaded' });
    } catch (error) {
      logger.error('Failed to reload monitors', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: 'Failed to reload monitors',
      });
    }
  });

  // TODO: Add API routes (will be added in document 05)

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
