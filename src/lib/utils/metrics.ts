import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export const register = new Registry();

// Incidents detected counter
export const incidentsDetected = new Counter({
  name: 'incidents_detected_total',
  help: 'Total number of incidents detected',
  labelNames: ['monitor_id', 'severity', 'tier'],
  registers: [register],
});

// Analysis duration histogram
export const analysisDuration = new Histogram({
  name: 'analysis_duration_seconds',
  help: 'Duration of incident analysis',
  labelNames: ['monitor_id', 'tier', 'success'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

// Investigation duration histogram
export const investigationDuration = new Histogram({
  name: 'investigation_duration_seconds',
  help: 'Duration of incident investigation',
  labelNames: ['monitor_id', 'tier'],
  buckets: [1, 5, 10, 15, 30, 60],
  registers: [register],
});

// LLM token usage counter
export const llmTokens = new Counter({
  name: 'llm_tokens_total',
  help: 'Total LLM tokens used',
  labelNames: ['type'], // 'input' or 'output'
  registers: [register],
});

// External API calls counter
export const externalApiCalls = new Counter({
  name: 'external_api_calls_total',
  help: 'Total external API calls',
  labelNames: ['service', 'status'], // service: datadog, gitlab, etc.
  registers: [register],
});

// External API duration histogram
export const externalApiDuration = new Histogram({
  name: 'external_api_duration_seconds',
  help: 'Duration of external API calls',
  labelNames: ['service', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Active incidents gauge
export const activeIncidents = new Gauge({
  name: 'active_incidents',
  help: 'Number of currently active incidents',
  registers: [register],
});

// Circuit breaker state gauge
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'],
  registers: [register],
});

// Cache hit rate counter
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type'], // baseline, metrics, llm, etc.
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

// API request duration
export const apiRequestDuration = new Histogram({
  name: 'api_request_duration_seconds',
  help: 'API request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Investigation tier usage counter
export const investigationTierUsed = new Counter({
  name: 'investigation_tier_used_total',
  help: 'Investigation tier usage count',
  labelNames: ['tier'], // tier1, tier2, tier3
  registers: [register],
});

// Evidence completeness histogram
export const evidenceCompleteness = new Histogram({
  name: 'evidence_completeness',
  help: 'Evidence bundle completeness score (0-1)',
  labelNames: ['tier'],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  registers: [register],
});

/**
 * Helper function to update circuit breaker state metric
 */
export function updateCircuitBreakerState(service: string, state: 'closed' | 'open' | 'half-open') {
  const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
  circuitBreakerState.set({ service }, stateValue);
}
