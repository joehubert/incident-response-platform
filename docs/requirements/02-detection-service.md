# Requirements Document 02: Detection Service
## AI-Powered Incident Response Platform - Claude Code Implementation Guide

**Version:** 1.0  
**Date:** January 14, 2026  
**Purpose:** Datadog monitoring, anomaly detection, and incident creation

---

## Overview

This document provides prescriptive requirements for implementing the Detection Service, which continuously monitors Datadog for anomalies, calculates baselines, applies threshold-based detection, and emits incident events. This service operates independently and triggers the investigation workflow.

**Dependencies:** Document 01 (Foundation) must be completed first.

---

## 1. Service Architecture

### 1.1 Detection Service Components

```
DetectionService
├── DatadogPoller          # Polls Datadog metrics on schedule
├── BaselineCalculator     # Calculates rolling baselines
├── AnomalyDetector        # Applies threshold logic
├── MonitorManager         # Loads and manages monitor configs
└── IncidentEmitter        # Creates incidents in database
```

---

## 2. Directory Structure

### 2.1 Files to Create (REQUIRED)

```
src/services/detection/
├── DetectionService.ts           # Main detection orchestrator
├── DatadogPoller.ts              # Metric polling logic
├── BaselineCalculator.ts         # Baseline calculation
├── AnomalyDetector.ts            # Anomaly detection logic
├── MonitorManager.ts             # Monitor config management
├── IncidentEmitter.ts            # Incident creation
├── types.ts                      # Detection-specific types
└── index.ts                      # Exports

tests/unit/services/detection/
├── DetectionService.test.ts
├── BaselineCalculator.test.ts
├── AnomalyDetector.test.ts
└── MonitorManager.test.ts

tests/integration/services/detection/
└── DetectionService.integration.test.ts
```

---

## 3. Type Definitions

### 3.1 src/services/detection/types.ts (REQUIRED - Exact Interfaces)

```typescript
import type { MonitorConfig, AnomalyDetectionResult } from '../../lib/types/incident';
import type { BaselineData, MetricValue } from '../../lib/types/common';

export interface DetectionResult {
  monitorId: string;
  isAnomaly: boolean;
  anomalyDetails?: AnomalyDetectionResult;
  checkedAt: Date;
}

export interface BaselineCache {
  monitorId: string;
  hourOfDay: number;
  baseline: BaselineData;
}

export interface MetricQueryResult {
  monitorId: string;
  values: MetricValue[];
  queriedAt: Date;
}

export interface PollingSchedule {
  monitorId: string;
  intervalSeconds: number;
  lastPollTime?: Date;
  nextPollTime: Date;
}
```

---

## 4. Datadog Client Integration

### 4.1 src/lib/clients/datadog/DatadogClient.ts (REQUIRED - Core Implementation)

```typescript
import axios, { AxiosInstance } from 'axios';
import { config } from '../../../config';
import { ExternalAPIError } from '../../utils/errors';
import logger from '../../utils/logger';
import { externalApiCalls, externalApiDuration } from '../../utils/metrics';
import type { MetricValue } from '../../types/common';

export interface DatadogMetricsQuery {
  query: string;
  from: number; // Unix timestamp
  to: number;   // Unix timestamp
}

export interface DatadogMetricsResponse {
  status: string;
  series: Array<{
    metric: string;
    points: Array<[number, number]>; // [timestamp, value]
    scope: string;
    unit?: string;
  }>;
}

export interface DatadogErrorTrackingQuery {
  query: string;
  from: number;
  to: number;
}

export interface DatadogErrorTrackingResponse {
  data: Array<{
    attributes: {
      message: string;
      timestamp: number;
      error: {
        stack?: string;
        kind?: string;
      };
      attributes?: {
        'error.stack'?: string;
      };
    };
  }>;
}

export interface DatadogDeploymentEvent {
  id: string;
  text: string;
  tags: string[];
  timestamp: number;
  alert_type: string;
}

export class DatadogClient {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly appKey: string;
  private readonly site: string;

  constructor() {
    this.apiKey = config.datadog.apiKey;
    this.appKey = config.datadog.appKey;
    this.site = config.datadog.site;

    if (!this.apiKey || !this.appKey) {
      throw new ExternalAPIError('Datadog', 'Missing API key or App key');
    }

    this.client = axios.create({
      baseURL: `https://api.${this.site}`,
      headers: {
        'DD-API-KEY': this.apiKey,
        'DD-APPLICATION-KEY': this.appKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add response interceptor for metrics
    this.client.interceptors.response.use(
      (response) => {
        externalApiCalls.inc({ service: 'datadog', status: 'success' });
        return response;
      },
      (error) => {
        externalApiCalls.inc({ service: 'datadog', status: 'error' });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Query metrics from Datadog
   */
  async queryMetrics(query: DatadogMetricsQuery): Promise<MetricValue[]> {
    const timer = externalApiDuration.startTimer({ service: 'datadog', endpoint: 'metrics' });

    try {
      logger.debug('Querying Datadog metrics', { query: query.query });

      const response = await this.client.get<DatadogMetricsResponse>('/api/v1/query', {
        params: {
          query: query.query,
          from: query.from,
          to: query.to,
        },
      });

      timer();

      if (!response.data.series || response.data.series.length === 0) {
        logger.warn('No metric data returned from Datadog', { query: query.query });
        return [];
      }

      // Flatten all series into MetricValue array
      const values: MetricValue[] = [];
      for (const series of response.data.series) {
        for (const [timestamp, value] of series.points) {
          values.push({
            timestamp: new Date(timestamp * 1000),
            value,
          });
        }
      }

      logger.debug('Received metric values', { 
        query: query.query, 
        count: values.length 
      });

      return values;
    } catch (error) {
      timer();
      logger.error('Failed to query Datadog metrics', {
        query: query.query,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalAPIError('Datadog', 'Failed to query metrics', error as Error);
    }
  }

  /**
   * Query Error Tracking for stack traces
   */
  async queryErrorTracking(
    query: string,
    from: number,
    to: number
  ): Promise<DatadogErrorTrackingResponse> {
    const timer = externalApiDuration.startTimer({ 
      service: 'datadog', 
      endpoint: 'error-tracking' 
    });

    try {
      logger.debug('Querying Datadog Error Tracking', { query });

      const response = await this.client.post<DatadogErrorTrackingResponse>(
        '/api/v2/logs/events/search',
        {
          filter: {
            query,
            from: new Date(from * 1000).toISOString(),
            to: new Date(to * 1000).toISOString(),
          },
          sort: '-timestamp',
          page: {
            limit: 10,
          },
        }
      );

      timer();

      logger.debug('Received error tracking data', {
        query,
        count: response.data.data?.length || 0,
      });

      return response.data;
    } catch (error) {
      timer();
      logger.warn('Failed to query Error Tracking (non-critical)', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      // Return empty result instead of throwing - Error Tracking is optional
      return { data: [] };
    }
  }

  /**
   * Query deployment events (optional - may not be available)
   */
  async queryDeploymentEvents(
    tags: string[],
    from: number,
    to: number
  ): Promise<DatadogDeploymentEvent[]> {
    if (!config.datadog.deploymentTrackingEnabled) {
      logger.debug('Deployment tracking disabled, skipping query');
      return [];
    }

    const timer = externalApiDuration.startTimer({ 
      service: 'datadog', 
      endpoint: 'events' 
    });

    try {
      logger.debug('Querying Datadog deployment events', { tags });

      const response = await this.client.get<{ events: DatadogDeploymentEvent[] }>(
        '/api/v1/events',
        {
          params: {
            start: from,
            end: to,
            tags: tags.join(','),
            sources: 'deployment',
          },
        }
      );

      timer();

      logger.debug('Received deployment events', {
        tags,
        count: response.data.events?.length || 0,
      });

      return response.data.events || [];
    } catch (error) {
      timer();
      logger.warn('Failed to query deployment events (non-critical)', {
        tags,
        error: error instanceof Error ? error.message : String(error),
      });
      // Return empty array - deployment tracking is optional
      return [];
    }
  }

  /**
   * Check if deployment tracking is available
   */
  async isDeploymentTrackingAvailable(serviceName: string): Promise<boolean> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;
      
      const events = await this.queryDeploymentEvents(
        [`service:${serviceName}`],
        oneHourAgo,
        now
      );

      return events.length > 0;
    } catch {
      return false;
    }
  }
}
```

### 4.2 src/lib/clients/datadog/types.ts (REQUIRED)

```typescript
export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site: string;
  errorTrackingEnabled: boolean;
  deploymentTrackingEnabled: boolean;
}

export interface DatadogErrorDetails {
  errorMessage: string;
  stackTrace: string;
  filePath?: string;
  lineNumber?: number;
  timestamp: Date;
}
```

### 4.3 src/lib/clients/datadog/index.ts (REQUIRED)

```typescript
export { DatadogClient } from './DatadogClient';
export type * from './types';
```

---

## 5. Baseline Calculator

### 5.1 src/services/detection/BaselineCalculator.ts (REQUIRED - Exact Implementation)

```typescript
import { RedisClient } from '../../lib/clients/redis';
import { DatadogClient } from '../../lib/clients/datadog';
import logger from '../../lib/utils/logger';
import type { BaselineData } from '../../lib/types/common';
import type { MonitorConfig } from '../../lib/types/incident';

export class BaselineCalculator {
  constructor(
    private readonly datadog: DatadogClient,
    private readonly redis: RedisClient
  ) {}

  /**
   * Get or calculate baseline for a monitor at a specific hour
   */
  async getBaseline(monitor: MonitorConfig, hourOfDay: number): Promise<BaselineData> {
    const cacheKey = this.getCacheKey(monitor.id, hourOfDay);

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      logger.debug('Baseline cache hit', { monitorId: monitor.id, hourOfDay });
      return JSON.parse(cached);
    }

    // Calculate baseline
    logger.debug('Baseline cache miss, calculating', { monitorId: monitor.id, hourOfDay });
    const baseline = await this.calculateBaseline(monitor, hourOfDay);

    // Cache for 24 hours
    await this.redis.setex(
      cacheKey,
      86400, // 24 hours
      JSON.stringify(baseline)
    );

    return baseline;
  }

  /**
   * Calculate baseline using 7-day rolling average for same hour of day
   */
  private async calculateBaseline(
    monitor: MonitorConfig,
    hourOfDay: number
  ): Promise<BaselineData> {
    const now = Math.floor(Date.now() / 1000);
    const samples: number[] = [];

    // Collect data from past 7 days for the same hour
    for (let day = 1; day <= 7; day++) {
      const targetTime = now - (day * 86400); // Go back 'day' days
      const hourStart = this.getHourStart(targetTime, hourOfDay);
      const hourEnd = hourStart + 3600; // 1 hour window

      try {
        const values = await this.datadog.queryMetrics({
          query: monitor.queries.metric,
          from: hourStart,
          to: hourEnd,
        });

        // Average values within this hour
        if (values.length > 0) {
          const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length;
          samples.push(avg);
        }
      } catch (error) {
        logger.warn('Failed to fetch baseline sample', {
          monitorId: monitor.id,
          day,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (samples.length === 0) {
      logger.warn('No baseline samples available', { monitorId: monitor.id, hourOfDay });
      // Return default baseline
      return {
        hourOfDay,
        averageValue: 0,
        standardDeviation: 0,
        sampleCount: 0,
        calculatedAt: new Date(),
      };
    }

    const averageValue = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    const variance =
      samples.reduce((sum, v) => sum + Math.pow(v - averageValue, 2), 0) / samples.length;
    const standardDeviation = Math.sqrt(variance);

    logger.info('Calculated baseline', {
      monitorId: monitor.id,
      hourOfDay,
      averageValue,
      standardDeviation,
      sampleCount: samples.length,
    });

    return {
      hourOfDay,
      averageValue,
      standardDeviation,
      sampleCount: samples.length,
      calculatedAt: new Date(),
    };
  }

  /**
   * Get the start timestamp of a specific hour
   */
  private getHourStart(timestamp: number, hourOfDay: number): number {
    const date = new Date(timestamp * 1000);
    date.setUTCHours(hourOfDay, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Generate cache key for baseline
   */
  private getCacheKey(monitorId: string, hourOfDay: number): string {
    return `datadog:baseline:${monitorId}:${hourOfDay}`;
  }
}
```

---

## 6. Anomaly Detector

### 6.1 src/services/detection/AnomalyDetector.ts (REQUIRED - Exact Implementation)

```typescript
import logger from '../../lib/utils/logger';
import type { AnomalyDetectionResult } from '../../lib/types/incident';
import type { MonitorConfig } from '../../lib/types/incident';
import type { BaselineData, MetricValue, Severity } from '../../lib/types/common';

export class AnomalyDetector {
  /**
   * Detect anomaly by comparing current value against baseline
   */
  detectAnomaly(
    monitor: MonitorConfig,
    currentValue: number,
    baseline: BaselineData
  ): AnomalyDetectionResult | null {
    const threshold = monitor.threshold;
    const baselineValue = baseline.averageValue;

    logger.debug('Detecting anomaly', {
      monitorId: monitor.id,
      currentValue,
      baselineValue,
      threshold,
    });

    let isAnomaly = false;
    let severity: Severity = 'low';
    let thresholdValue = 0;

    switch (threshold.type) {
      case 'absolute':
        // Current value exceeds absolute threshold
        isAnomaly = currentValue > threshold.critical;
        severity = currentValue > threshold.critical ? 'critical' : 
                   currentValue > threshold.warning ? 'high' : 'low';
        thresholdValue = isAnomaly ? threshold.critical : threshold.warning;
        break;

      case 'percentage':
        // Current value changed by percentage from baseline
        const percentChange = Math.abs(((currentValue - baselineValue) / baselineValue) * 100);
        isAnomaly = percentChange > threshold.critical;
        severity = percentChange > threshold.critical ? 'critical' :
                   percentChange > threshold.warning ? 'high' : 'low';
        thresholdValue = baselineValue * (1 + threshold.critical / 100);
        break;

      case 'multiplier':
        // Current value is multiplier times baseline
        const multiplier = currentValue / baselineValue;
        isAnomaly = multiplier > threshold.critical;
        severity = multiplier > threshold.critical ? 'critical' :
                   multiplier > threshold.warning ? 'high' : 'low';
        thresholdValue = baselineValue * threshold.critical;
        break;
    }

    if (!isAnomaly) {
      logger.debug('No anomaly detected', { monitorId: monitor.id });
      return null;
    }

    const deviationPercentage = ((currentValue - baselineValue) / baselineValue) * 100;

    const result: AnomalyDetectionResult = {
      isAnomaly: true,
      severity,
      currentValue,
      baselineValue,
      thresholdValue,
      deviationPercentage,
      detectedAt: new Date(),
    };

    logger.info('Anomaly detected', {
      monitorId: monitor.id,
      severity,
      currentValue,
      baselineValue,
      deviationPercentage,
    });

    return result;
  }

  /**
   * Get the latest value from metric values
   */
  getLatestValue(values: MetricValue[]): number | null {
    if (values.length === 0) {
      return null;
    }

    // Sort by timestamp descending and get first
    const sorted = [...values].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return sorted[0].value;
  }

  /**
   * Get average value from metric values
   */
  getAverageValue(values: MetricValue[]): number | null {
    if (values.length === 0) {
      return null;
    }

    const sum = values.reduce((acc, v) => acc + v.value, 0);
    return sum / values.length;
  }
}
```

---

## 7. Monitor Manager

### 7.1 src/services/detection/MonitorManager.ts (REQUIRED - Exact Implementation)

```typescript
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import logger from '../../lib/utils/logger';
import { ValidationError } from '../../lib/utils/errors';
import type { MonitorConfig } from '../../lib/types/incident';

// Zod schema for monitor validation
const ThresholdSchema = z.object({
  type: z.enum(['absolute', 'percentage', 'multiplier']),
  warning: z.number(),
  critical: z.number(),
});

const MonitorConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  queries: z.object({
    metric: z.string(),
    errorTracking: z.string().optional(),
    deployment: z.string().optional(),
  }),
  checkIntervalSeconds: z.number().min(30),
  threshold: ThresholdSchema,
  timeWindow: z.string(),
  gitlabRepositories: z.array(z.string()),
  enableDatabaseInvestigation: z.boolean(),
  databaseContext: z.object({
    relevantTables: z.array(z.string()),
    relevantSchemas: z.array(z.string()),
  }).optional(),
  teamsNotification: z.object({
    channelWebhookUrl: z.string(),
    mentionUsers: z.array(z.string()).optional(),
    urlPatterns: z.object({
      datadog: z.string().optional(),
      gitlab: z.string().optional(),
      incident: z.string().optional(),
    }).optional(),
  }),
  tags: z.array(z.string()),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
});

const MonitorsFileSchema = z.object({
  monitors: z.array(MonitorConfigSchema),
});

export class MonitorManager {
  private monitors: Map<string, MonitorConfig> = new Map();
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = path.resolve(configPath);
  }

  /**
   * Load monitors from configuration file
   */
  async loadMonitors(): Promise<void> {
    try {
      logger.info('Loading monitor configurations', { path: this.configPath });

      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate against schema
      const validated = MonitorsFileSchema.parse(parsed);

      // Clear existing monitors
      this.monitors.clear();

      // Load enabled monitors
      for (const monitor of validated.monitors) {
        if (monitor.enabled) {
          this.monitors.set(monitor.id, monitor);
          logger.info('Loaded monitor', {
            id: monitor.id,
            name: monitor.name,
            interval: monitor.checkIntervalSeconds,
          });
        } else {
          logger.debug('Skipped disabled monitor', { id: monitor.id, name: monitor.name });
        }
      }

      logger.info('Monitor configurations loaded', { count: this.monitors.size });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Monitor configuration validation failed', {
          errors: error.errors,
        });
        throw new ValidationError('Invalid monitor configuration', error.errors);
      }

      logger.error('Failed to load monitor configurations', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Reload monitors (for hot reload)
   */
  async reloadMonitors(): Promise<void> {
    logger.info('Reloading monitor configurations');
    await this.loadMonitors();
  }

  /**
   * Get all enabled monitors
   */
  getMonitors(): MonitorConfig[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Get monitor by ID
   */
  getMonitor(id: string): MonitorConfig | undefined {
    return this.monitors.get(id);
  }

  /**
   * Get monitor count
   */
  getMonitorCount(): number {
    return this.monitors.size;
  }
}
```

---

## 8. Incident Emitter

### 8.1 src/services/detection/IncidentEmitter.ts (REQUIRED - Exact Implementation)

```typescript
import { DatabaseClient } from '../../lib/clients/database';
import logger from '../../lib/utils/logger';
import { incidentsDetected, activeIncidents } from '../../lib/utils/metrics';
import type { Incident, IncidentCreateInput } from '../../lib/types/incident';
import type { AnomalyDetectionResult } from '../../lib/types/incident';

export class IncidentEmitter {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * Create a new incident from anomaly detection
   */
  async createIncident(input: IncidentCreateInput): Promise<Incident> {
    try {
      logger.info('Creating incident', {
        monitorId: input.monitorId,
        serviceName: input.serviceName,
        severity: input.severity,
      });

      const incident = await this.database.createIncident(input);

      // Update metrics
      incidentsDetected.inc({
        monitor_id: input.monitorId,
        severity: input.severity,
        tier: 'unknown', // Will be updated during investigation
      });

      // Update active incidents gauge
      const activeCount = await this.database.getActiveIncidentCount();
      activeIncidents.set(activeCount);

      logger.info('Incident created', {
        incidentId: incident.id,
        monitorId: input.monitorId,
        severity: input.severity,
      });

      return incident;
    } catch (error) {
      logger.error('Failed to create incident', {
        monitorId: input.monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if incident already exists for this monitor (deduplication)
   */
  async hasActiveIncident(monitorId: string, withinMinutes: number = 5): Promise<boolean> {
    try {
      const incidents = await this.database.getRecentIncidents(monitorId, withinMinutes);
      return incidents.length > 0;
    } catch (error) {
      logger.error('Failed to check for active incident', {
        monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false; // Assume no active incident on error
    }
  }
}
```

---

## 9. Detection Service (Main Orchestrator)

### 9.1 src/services/detection/DetectionService.ts (REQUIRED - Exact Implementation)

```typescript
import { DatadogClient } from '../../lib/clients/datadog';
import { RedisClient } from '../../lib/clients/redis';
import { DatabaseClient } from '../../lib/clients/database';
import { BaselineCalculator } from './BaselineCalculator';
import { AnomalyDetector } from './AnomalyDetector';
import { MonitorManager } from './MonitorManager';
import { IncidentEmitter } from './IncidentEmitter';
import logger, { createChildLogger } from '../../lib/utils/logger';
import { config } from '../../config';
import type { MonitorConfig } from '../../lib/types/incident';
import type { DetectionResult } from './types';

export class DetectionService {
  private readonly datadog: DatadogClient;
  private readonly redis: RedisClient;
  private readonly database: DatabaseClient;
  private readonly baselineCalculator: BaselineCalculator;
  private readonly anomalyDetector: AnomalyDetector;
  private readonly monitorManager: MonitorManager;
  private readonly incidentEmitter: IncidentEmitter;
  
  private pollingIntervals: Map<string, NodeJS.Timer> = new Map();
  private isRunning = false;

  constructor() {
    this.datadog = new DatadogClient();
    this.redis = new RedisClient();
    this.database = new DatabaseClient();
    
    this.baselineCalculator = new BaselineCalculator(this.datadog, this.redis);
    this.anomalyDetector = new AnomalyDetector();
    this.monitorManager = new MonitorManager(config.monitoring.configPath);
    this.incidentEmitter = new IncidentEmitter(this.database);
  }

  /**
   * Start the detection service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Detection service already running');
      return;
    }

    logger.info('Starting Detection Service');

    // Load monitor configurations
    await this.monitorManager.loadMonitors();

    // Start polling for each monitor
    const monitors = this.monitorManager.getMonitors();
    for (const monitor of monitors) {
      this.startMonitorPolling(monitor);
    }

    this.isRunning = true;
    logger.info('Detection Service started', { monitorCount: monitors.length });
  }

  /**
   * Stop the detection service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Detection Service');

    // Clear all polling intervals
    for (const [monitorId, interval] of this.pollingIntervals.entries()) {
      clearInterval(interval);
      logger.debug('Stopped polling for monitor', { monitorId });
    }

    this.pollingIntervals.clear();
    this.isRunning = false;

    logger.info('Detection Service stopped');
  }

  /**
   * Reload monitor configurations (hot reload)
   */
  async reloadMonitors(): Promise<void> {
    logger.info('Reloading monitors');

    // Stop current polling
    for (const [monitorId, interval] of this.pollingIntervals.entries()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    // Reload configurations
    await this.monitorManager.reloadMonitors();

    // Restart polling
    const monitors = this.monitorManager.getMonitors();
    for (const monitor of monitors) {
      this.startMonitorPolling(monitor);
    }

    logger.info('Monitors reloaded', { count: monitors.length });
  }

  /**
   * Start polling for a specific monitor
   */
  private startMonitorPolling(monitor: MonitorConfig): void {
    const intervalMs = monitor.checkIntervalSeconds * 1000;

    // Run immediately
    this.checkMonitor(monitor);

    // Then run on interval
    const interval = setInterval(() => {
      this.checkMonitor(monitor);
    }, intervalMs);

    this.pollingIntervals.set(monitor.id, interval);

    logger.info('Started polling for monitor', {
      monitorId: monitor.id,
      name: monitor.name,
      intervalSeconds: monitor.checkIntervalSeconds,
    });
  }

  /**
   * Check a monitor for anomalies
   */
  private async checkMonitor(monitor: MonitorConfig): Promise<void> {
    const contextLogger = createChildLogger(`monitor:${monitor.id}`);

    try {
      contextLogger.debug('Checking monitor', { name: monitor.name });

      // Parse time window
      const timeWindowSeconds = this.parseTimeWindow(monitor.timeWindow);
      const now = Math.floor(Date.now() / 1000);
      const from = now - timeWindowSeconds;

      // Query current metrics
      const values = await this.datadog.queryMetrics({
        query: monitor.queries.metric,
        from,
        to: now,
      });

      if (values.length === 0) {
        contextLogger.warn('No metric values returned', { query: monitor.queries.metric });
        return;
      }

      // Get current value (average over time window)
      const currentValue = this.anomalyDetector.getAverageValue(values);
      if (currentValue === null) {
        contextLogger.warn('Could not calculate current value');
        return;
      }

      // Get baseline for current hour
      const currentHour = new Date().getUTCHours();
      const baseline = await this.baselineCalculator.getBaseline(monitor, currentHour);

      // Detect anomaly
      const anomaly = this.anomalyDetector.detectAnomaly(monitor, currentValue, baseline);

      if (anomaly) {
        // Check for duplicate incidents
        const hasActive = await this.incidentEmitter.hasActiveIncident(monitor.id, 5);
        if (hasActive) {
          contextLogger.info('Active incident already exists, skipping', {
            monitorId: monitor.id,
          });
          return;
        }

        // Query error tracking if available
        let errorMessage: string | undefined;
        let stackTrace: string | undefined;

        if (monitor.queries.errorTracking) {
          const errorData = await this.datadog.queryErrorTracking(
            monitor.queries.errorTracking,
            from,
            now
          );

          if (errorData.data.length > 0) {
            const firstError = errorData.data[0].attributes;
            errorMessage = firstError.message;
            stackTrace = firstError.error.stack || firstError.attributes?.['error.stack'];
          }
        }

        // Create incident
        await this.incidentEmitter.createIncident({
          monitorId: monitor.id,
          serviceName: monitor.name,
          severity: anomaly.severity,
          metricName: monitor.queries.metric,
          metricValue: anomaly.currentValue,
          baselineValue: anomaly.baselineValue,
          thresholdValue: anomaly.thresholdValue,
          errorMessage,
          stackTrace,
          tags: monitor.tags,
        });

        contextLogger.info('Incident created for anomaly', {
          severity: anomaly.severity,
          currentValue: anomaly.currentValue,
          baselineValue: anomaly.baselineValue,
        });
      } else {
        contextLogger.debug('No anomaly detected', {
          currentValue,
          baselineValue: baseline.averageValue,
        });
      }
    } catch (error) {
      contextLogger.error('Error checking monitor', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Parse time window string (e.g., "5m", "1h") to seconds
   */
  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/^(\d+)([mh])$/);
    if (!match) {
      throw new Error(`Invalid time window format: ${timeWindow}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      default:
        throw new Error(`Unknown time unit: ${unit}`);
    }
  }
}
```

---

## 10. Service Export

### 10.1 src/services/detection/index.ts (REQUIRED)

```typescript
export { DetectionService } from './DetectionService';
export { MonitorManager } from './MonitorManager';
export type * from './types';
```

---

## 11. Database Client Stubs

### 11.1 src/lib/clients/database/DatabaseClient.ts (STUB - Basic Structure)

```typescript
import sql from 'mssql';
import { config } from '../../../config';
import { DatabaseError } from '../../utils/errors';
import logger from '../../utils/logger';
import type { Incident, IncidentCreateInput } from '../../types/incident';

export class DatabaseClient {
  private pool: sql.ConnectionPool | null = null;

  constructor() {}

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    try {
      const dbConfig: sql.config = {
        server: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.username,
        password: config.database.password,
        options: {
          encrypt: true,
          trustServerCertificate: false,
        },
        pool: {
          max: 10,
          min: 2,
          idleTimeoutMillis: 30000,
        },
      };

      this.pool = await sql.connect(dbConfig);
      logger.info('Connected to database');
    } catch (error) {
      logger.error('Failed to connect to database', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to connect to database', error as Error);
    }
  }

  /**
   * Create incident (STUB - will be implemented in next document)
   */
  async createIncident(input: IncidentCreateInput): Promise<Incident> {
    // TODO: Implement in next document
    throw new Error('Not implemented yet');
  }

  /**
   * Get recent incidents for a monitor (STUB)
   */
  async getRecentIncidents(monitorId: string, withinMinutes: number): Promise<Incident[]> {
    // TODO: Implement in next document
    return [];
  }

  /**
   * Get active incident count (STUB)
   */
  async getActiveIncidentCount(): Promise<number> {
    // TODO: Implement in next document
    return 0;
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      logger.info('Disconnected from database');
    }
  }
}
```

### 11.2 src/lib/clients/database/index.ts (REQUIRED)

```typescript
export { DatabaseClient } from './DatabaseClient';
export type * from './types';
```

### 11.3 src/lib/clients/database/types.ts (STUB)

```typescript
// Types will be added in next document
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}
```

---

## 12. Redis Client Stubs

### 12.1 src/lib/clients/redis/RedisClient.ts (STUB - Basic Operations)

```typescript
import Redis from 'ioredis';
import { config } from '../../../config';
import { CacheError } from '../../utils/errors';
import logger from '../../utils/logger';
import { cacheHits, cacheMisses } from '../../utils/metrics';

export class RedisClient {
  private client: Redis | null = null;

  constructor() {}

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.client.on('error', (error) => {
        logger.error('Redis error', { error: error.message });
      });

      this.client.on('connect', () => {
        logger.info('Connected to Redis');
      });

      await this.client.ping();
    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to connect to Redis', error as Error);
    }
  }

  /**
   * Get value from cache
   */
  async get(key: string, cacheType: string = 'generic'): Promise<string | null> {
    if (!this.client) {
      throw new CacheError('Redis client not connected');
    }

    try {
      const value = await this.client.get(key);
      
      if (value !== null) {
        cacheHits.inc({ cache_type: cacheType });
      } else {
        cacheMisses.inc({ cache_type: cacheType });
      }

      return value;
    } catch (error) {
      logger.error('Redis GET error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to get from cache', error as Error);
    }
  }

  /**
   * Set value in cache with TTL
   */
  async setex(key: string, ttl: number, value: string): Promise<void> {
    if (!this.client) {
      throw new CacheError('Redis client not connected');
    }

    try {
      await this.client.setex(key, ttl, value);
    } catch (error) {
      logger.error('Redis SETEX error', {
        key,
        ttl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to set cache', error as Error);
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    if (!this.client) {
      throw new CacheError('Redis client not connected');
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to delete from cache', error as Error);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info('Disconnected from Redis');
    }
  }
}
```

### 12.2 src/lib/clients/redis/index.ts (REQUIRED)

```typescript
export { RedisClient } from './RedisClient';
```

---

## 13. Integration with Main Server

### 13.1 Update src/server.ts (ADD Detection Service)

```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { logger } from './lib/utils/logger';
import { register as metricsRegister } from './lib/utils/metrics';
import { DetectionService } from './services/detection';
import { DatabaseClient } from './lib/clients/database';
import { RedisClient } from './lib/clients/redis';

let detectionService: DetectionService | null = null;

export async function startServer() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Initialize database
  const database = new DatabaseClient();
  await database.connect();

  // Initialize Redis
  const redis = new RedisClient();
  await redis.connect();

  // Initialize Detection Service
  detectionService = new DetectionService();
  await detectionService.start();

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  });

  // Reload monitors endpoint (for hot reload)
  app.post('/api/v1/monitors/reload', async (req, res) => {
    try {
      await detectionService?.reloadMonitors();
      res.json({ success: true, message: 'Monitors reloaded' });
    } catch (error) {
      logger.error('Failed to reload monitors', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to reload monitors' 
      });
    }
  });

  // TODO: Add API routes (will be added in document 05)

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await detectionService?.stop();
    await database.disconnect();
    await redis.disconnect();
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
```

---

## 14. Example Monitor Configuration

### 14.1 config/monitors.json (EXAMPLE - User Template)

```json
{
  "monitors": [
    {
      "id": "api-5xx-errors",
      "name": "API 5xx Error Rate",
      "description": "Monitor for elevated 5xx errors in production API",
      "enabled": true,
      "queries": {
        "metric": "sum:trace.http.request.errors{service:api,env:production,http.status_code:5*}.as_rate()",
        "errorTracking": "service:api env:production status:error",
        "deployment": "service:api env:production"
      },
      "checkIntervalSeconds": 60,
      "threshold": {
        "type": "percentage",
        "warning": 5,
        "critical": 10
      },
      "timeWindow": "5m",
      "gitlabRepositories": ["myorg/api-service", "myorg/shared-lib"],
      "enableDatabaseInvestigation": true,
      "databaseContext": {
        "relevantTables": ["Users", "Orders", "Sessions"],
        "relevantSchemas": ["dbo"]
      },
      "teamsNotification": {
        "channelWebhookUrl": "https://outlook.office.com/webhook/...",
        "mentionUsers": ["oncall@example.com"],
        "urlPatterns": {
          "datadog": "https://app.datadoghq.com/apm/service/api",
          "gitlab": "https://gitlab.com/{{repository}}/commit/{{sha}}",
          "incident": "https://platform.example.com/api/v1/incidents/{{incidentId}}"
        }
      },
      "tags": ["service:api", "team:backend"],
      "severity": "critical"
    }
  ]
}
```

---

## 15. Testing

### 15.1 tests/unit/services/detection/AnomalyDetector.test.ts (EXAMPLE)

```typescript
import { AnomalyDetector } from '../../../../src/services/detection/AnomalyDetector';
import type { MonitorConfig } from '../../../../src/lib/types/incident';

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector();
  });

  describe('detectAnomaly', () => {
    it('should detect anomaly with absolute threshold', () => {
      const monitor: MonitorConfig = {
        id: 'test-monitor',
        threshold: {
          type: 'absolute',
          warning: 50,
          critical: 100,
        },
      } as MonitorConfig;

      const baseline = {
        averageValue: 20,
        standardDeviation: 5,
        sampleCount: 7,
        hourOfDay: 10,
        calculatedAt: new Date(),
      };

      const result = detector.detectAnomaly(monitor, 150, baseline);

      expect(result).not.toBeNull();
      expect(result?.isAnomaly).toBe(true);
      expect(result?.severity).toBe('critical');
      expect(result?.currentValue).toBe(150);
    });

    it('should not detect anomaly when below threshold', () => {
      const monitor: MonitorConfig = {
        id: 'test-monitor',
        threshold: {
          type: 'absolute',
          warning: 50,
          critical: 100,
        },
      } as MonitorConfig;

      const baseline = {
        averageValue: 20,
        standardDeviation: 5,
        sampleCount: 7,
        hourOfDay: 10,
        calculatedAt: new Date(),
      };

      const result = detector.detectAnomaly(monitor, 30, baseline);

      expect(result).toBeNull();
    });
  });
});
```

---

## 16. Implementation Notes for Claude Code

### 16.1 What to Generate

1. ✅ Complete Detection Service implementation
2. ✅ Datadog client with all methods
3. ✅ Baseline calculator with caching
4. ✅ Anomaly detector with three threshold types
5. ✅ Monitor manager with validation
6. ✅ Incident emitter
7. ✅ Database client stubs (basic structure only)
8. ✅ Redis client stubs (basic operations only)
9. ✅ Update server.ts to start Detection Service
10. ✅ Example monitor configuration
11. ✅ Unit test examples

### 16.2 What NOT to Implement Yet

- ❌ Full database operations (next document)
- ❌ Investigation service (next document)
- ❌ Analysis service (next document)
- ❌ Notification service (next document)
- ❌ Full API routes (document 05)

### 16.3 Key Implementation Details

1. **Datadog Client**: Implement all three query methods (metrics, error tracking, deployment events) with proper error handling
2. **Baseline Calculation**: Use 7-day rolling average for same hour of day, with Redis caching
3. **Anomaly Detection**: Support all three threshold types (absolute, percentage, multiplier)
4. **Monitor Polling**: Use setInterval for each monitor with configurable intervals
5. **Deduplication**: Check for active incidents before creating new ones
6. **Graceful Shutdown**: Handle SIGTERM to stop polling cleanly

---

## 17. Validation Checklist

After generation:

- ✅ Detection service starts without errors
- ✅ Monitors load from config file
- ✅ Datadog client successfully queries metrics
- ✅ Baseline calculation works with Redis caching
- ✅ Anomaly detection logic is correct for all threshold types
- ✅ Monitor polling runs at configured intervals
- ✅ Hot reload endpoint works (/api/v1/monitors/reload)
- ✅ Unit tests pass
- ✅ No TypeScript errors

---

**End of Document 02**

This document provides complete requirements for the Detection Service. Next document will cover Investigation Service (GitLab, Sourcegraph, Database investigation).
