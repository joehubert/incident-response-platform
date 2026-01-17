export class PlatformError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PlatformError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends PlatformError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
    this.name = 'ConfigurationError';
  }
}

export class ExternalAPIError extends PlatformError {
  constructor(
    service: string,
    message: string,
    public originalError?: Error,
    details?: unknown
  ) {
    super(`${service} API error: ${message}`, 'EXTERNAL_API_ERROR', 502, details);
    this.name = 'ExternalAPIError';
  }
}

export class DatabaseError extends PlatformError {
  constructor(
    message: string,
    public originalError?: Error,
    details?: unknown
  ) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AnalysisError extends PlatformError {
  constructor(message: string, details?: unknown) {
    super(message, 'ANALYSIS_ERROR', 500, details);
    this.name = 'AnalysisError';
  }
}

export class CacheError extends PlatformError {
  constructor(
    message: string,
    public originalError?: Error,
    details?: unknown
  ) {
    super(message, 'CACHE_ERROR', 500, details);
    this.name = 'CacheError';
  }
}

export class AuthenticationError extends PlatformError {
  constructor(message: string = 'Authentication failed', details?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}
