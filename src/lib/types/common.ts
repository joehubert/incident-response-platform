/**
 * Common type definitions shared across the platform
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type IncidentStatus = 'active' | 'resolved' | 'false_positive';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ComplexityLevel = 'low' | 'medium' | 'high';

export type InvestigationTier = 'tier1' | 'tier2' | 'tier3';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface Threshold {
  type: 'absolute' | 'percentage' | 'multiplier';
  warning: number;
  critical: number;
}

export interface MetricValue {
  timestamp: Date;
  value: number;
}

export interface BaselineData {
  hourOfDay: number;
  averageValue: number;
  standardDeviation: number;
  sampleCount: number;
  calculatedAt: Date;
}

export interface ApiKeyMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    datadog: ComponentHealth;
    llm: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
