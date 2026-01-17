import { z } from 'zod';

/**
 * Zod validation helpers for the platform
 */

/**
 * Validate and parse data with a Zod schema
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validation that returns a result object instead of throwing
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Common validation schemas
 */
export const schemas = {
  uuid: z.string().uuid(),
  email: z.string().email(),
  url: z.string().url(),
  positiveInt: z.number().int().positive(),
  nonEmptyString: z.string().min(1),
  dateString: z.string().datetime(),
};
