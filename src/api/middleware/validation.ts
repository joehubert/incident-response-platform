import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../../lib/utils/logger';

/**
 * Request validation schema
 */
export interface ValidationSchema {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}

/**
 * Validation middleware factory
 *
 * Creates middleware that validates request body, query params, and URL params
 * against the provided Zod schemas.
 */
export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate body
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      // Validate query params
      if (schema.query) {
        req.query = schema.query.parse(req.query) as typeof req.query;
      }

      // Validate URL params
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.debug('Request validation failed', {
          path: req.path,
          method: req.method,
          errors: error.errors,
        });

        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }

      // Unexpected error
      logger.error('Unexpected validation error', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      });
    }
  };
}

// Common validation schemas
export const paginationSchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => parseInt(v, 10))
    .optional()
    .default('1'),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Math.min(parseInt(v, 10), 100))
    .optional()
    .default('20'),
});

export const uuidSchema = z.object({
  id: z.string().uuid(),
});

export const incidentStatusSchema = z.enum(['active', 'resolved', 'false_positive']);

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low']);
