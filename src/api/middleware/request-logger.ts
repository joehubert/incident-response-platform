import { Request, Response, NextFunction } from 'express';
import logger from '../../lib/utils/logger';
import { apiRequestDuration } from '../../lib/utils/metrics';

/**
 * Request logging and metrics middleware
 *
 * Logs incoming requests and records response times.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Hook into response to log completion
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Record metrics
    apiRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status: res.statusCode.toString(),
      },
      duration / 1000
    );

    // Log response
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
}
