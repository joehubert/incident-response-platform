import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../../lib/utils/logger';

/**
 * API key authentication middleware
 *
 * Validates API keys passed in the X-API-Key header.
 * Keys should be prefixed with 'irp_' for identification.
 */
export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    logger.warn('Missing API key in request', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(401).json({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Missing API key',
      },
    });
    return;
  }

  try {
    // Validate API key format
    if (!apiKey.startsWith('irp_')) {
      logger.warn('Invalid API key format', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid API key format',
        },
      });
      return;
    }

    // TODO: In production, validate against stored API key hashes in database
    // const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    // const storedKey = await database.getApiKeyByHash(keyHash);
    // if (!storedKey || !storedKey.isActive) { ... }

    // Add API key metadata to request for logging/auditing
    (req as Request & { apiKey?: { id: string } }).apiKey = {
      id: apiKey.substring(0, 12) + '...', // Partial key for logging
    };

    logger.debug('API key authenticated', {
      path: req.path,
      method: req.method,
      keyId: apiKey.substring(0, 12) + '...',
    });

    next();
  } catch (error) {
    logger.error('API key validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  }
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `irp_${randomBytes}`;
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Middleware to require specific permissions (for future use)
 */
export function requirePermission(_permission: string) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    // TODO: Check if the authenticated API key has the required permission
    // For now, all authenticated requests have all permissions
    next();
  };
}
