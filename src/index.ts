import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

import { config } from './config';
import { logger } from './lib/utils/logger';
import { startServer } from './server';

async function bootstrap() {
  try {
    logger.info('Starting Incident Response Platform', {
      version: process.env.APP_VERSION || '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    });

    // Start HTTP server
    await startServer();

    logger.info('Platform started successfully', {
      port: config.server.port,
    });
  } catch (error) {
    logger.error('Failed to start platform', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise,
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the application
bootstrap();
