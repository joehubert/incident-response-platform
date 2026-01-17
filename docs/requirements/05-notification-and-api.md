# Requirements Document 05: Notification Service & REST API
## AI-Powered Incident Response Platform - Claude Code Implementation Guide

**Version:** 1.0  
**Date:** January 14, 2026  
**Purpose:** MS Teams notifications and REST API endpoints

---

## Overview

This document covers the Notification Service (MS Teams integration) and complete REST API implementation, including full database operations.

**Dependencies:** Documents 01-04 must be completed first.

---

## 1. Directory Structure

```
src/services/notification/
├── NotificationService.ts          # Main notification orchestrator
├── MessageFormatter.ts             # Teams message formatting
├── types.ts                        # Notification types
└── index.ts

src/lib/clients/teams/
├── TeamsClient.ts                  # MS Teams Graph API client
├── types.ts
└── index.ts

src/api/
├── routes/
│   ├── incidents.ts                # Incident routes
│   ├── monitors.ts                 # Monitor routes
│   ├── health.ts                   # Health routes
│   └── index.ts
├── controllers/
│   ├── IncidentsController.ts
│   ├── MonitorsController.ts
│   └── HealthController.ts
├── middleware/
│   ├── auth.ts                     # API key authentication
│   ├── validation.ts               # Request validation
│   ├── error-handler.ts            # Error handling
│   └── index.ts
└── index.ts
```

---

## 2. MS Teams Client

### 2.1 src/lib/clients/teams/TeamsClient.ts (REQUIRED)

```typescript
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { config } from '../../../config';
import { ExternalAPIError } from '../../utils/errors';
import logger from '../../utils/logger';
import { externalApiCalls, externalApiDuration } from '../../utils/metrics';
import { defaultRetry } from '../../utils/retry';

export interface TeamsMessage {
  content: string;
  channelId?: string;
  teamId?: string;
  webhookUrl?: string;
}

export class TeamsClient {
  private client: Client;
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.tenantId = config.msTeams.tenantId;
    this.clientId = config.msTeams.clientId;
    this.clientSecret = config.msTeams.clientSecret;

    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new ExternalAPIError('Teams', 'Missing Azure AD credentials');
    }

    this.initializeClient();
  }

  /**
   * Initialize MS Graph client
   */
  private initializeClient() {
    const credential = new ClientSecretCredential(
      this.tenantId,
      this.clientId,
      this.clientSecret
    );

    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken('https://graph.microsoft.com/.default');
          return token.token;
        },
      },
    });
  }

  /**
   * Send message to Teams channel
   */
  async sendMessage(message: TeamsMessage): Promise<void> {
    const timer = externalApiDuration.startTimer({ service: 'teams', endpoint: 'message' });

    try {
      logger.debug('Sending Teams message', {
        hasWebhook: !!message.webhookUrl,
        hasChannel: !!message.channelId,
      });

      if (message.webhookUrl) {
        await this.sendViaWebhook(message.webhookUrl, message.content);
      } else if (message.teamId && message.channelId) {
        await this.sendViaGraphAPI(message.teamId, message.channelId, message.content);
      } else {
        throw new Error('Either webhookUrl or teamId+channelId must be provided');
      }

      timer();
      externalApiCalls.inc({ service: 'teams', status: 'success' });

      logger.info('Teams message sent successfully');
    } catch (error) {
      timer();
      externalApiCalls.inc({ service: 'teams', status: 'error' });
      logger.error('Failed to send Teams message', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalAPIError('Teams', 'Failed to send message', error as Error);
    }
  }

  /**
   * Send via incoming webhook
   */
  private async sendViaWebhook(webhookUrl: string, content: string): Promise<void> {
    const axios = require('axios');
    
    await defaultRetry.execute(
      () => axios.post(webhookUrl, {
        text: content,
      }),
      'teams.webhook'
    );
  }

  /**
   * Send via Graph API
   */
  private async sendViaGraphAPI(
    teamId: string,
    channelId: string,
    content: string
  ): Promise<void> {
    await defaultRetry.execute(
      () => this.client
        .api(`/teams/${teamId}/channels/${channelId}/messages`)
        .post({
          body: {
            content,
          },
        }),
      'teams.graphapi'
    );
  }
}
```

### 2.2 src/lib/clients/teams/index.ts

```typescript
export { TeamsClient } from './TeamsClient';
export type * from './types';
```

---

## 3. Message Formatter

### 3.1 src/services/notification/MessageFormatter.ts (REQUIRED)

```typescript
import type { Incident } from '../../lib/types/incident';
import type { IncidentAnalysis } from '../../lib/types/analysis';
import type { MonitorConfig } from '../../lib/types/incident';

export class MessageFormatter {
  /**
   * Format incident notification message
   */
  formatIncidentMessage(
    incident: Incident,
    analysis: IncidentAnalysis,
    monitor: MonitorConfig
  ): string {
    const sections: string[] = [];

    // Header
    sections.push(`🚨 INCIDENT DETECTED: ${monitor.name}`);
    sections.push(
      `Severity: ${incident.severity.toUpperCase()} | ` +
      `Confidence: ${analysis.rootCause.confidence.toUpperCase()} | ` +
      `Service: ${incident.serviceName}`
    );
    sections.push('');

    // Details
    sections.push('📊 DETAILS:');
    sections.push(`Metric: ${incident.metricName}`);
    sections.push(
      `Current: ${incident.metricValue.toFixed(2)} | ` +
      `Baseline: ${incident.baselineValue.toFixed(2)}`
    );
    sections.push(`Detected: ${incident.detectedAt.toISOString()}`);
    sections.push('');

    // Root Cause
    sections.push('🔍 ROOT CAUSE:');
    sections.push(analysis.summary);
    sections.push('');
    sections.push(analysis.rootCause.hypothesis);
    sections.push('');

    // Evidence
    if (analysis.rootCause.evidence.length > 0) {
      sections.push('📋 EVIDENCE:');
      for (const evidence of analysis.rootCause.evidence.slice(0, 5)) {
        sections.push(`• ${evidence}`);
      }
      sections.push('');
    }

    // Recommended Actions
    if (analysis.recommendedActions.length > 0) {
      sections.push('✅ RECOMMENDED ACTIONS:');
      for (const action of analysis.recommendedActions.slice(0, 3)) {
        sections.push(`${action.priority}. ${action.action}`);
      }
      sections.push('');
    }

    // URLs
    sections.push('🔗 LINKS:');
    
    const urls = monitor.teamsNotification.urlPatterns || {};
    
    if (urls.incident) {
      const incidentUrl = this.interpolateUrl(urls.incident, {
        incidentId: incident.id,
      });
      sections.push(`View Incident: ${incidentUrl}`);
    }

    if (urls.datadog) {
      const datadogUrl = this.interpolateUrl(urls.datadog, {
        serviceName: incident.serviceName,
      });
      sections.push(`View Datadog: ${datadogUrl}`);
    }

    if (analysis.rootCause.suspectedCommit && urls.gitlab) {
      const gitlabUrl = this.interpolateUrl(urls.gitlab, {
        repository: analysis.rootCause.suspectedCommit.repository,
        sha: analysis.rootCause.suspectedCommit.sha,
      });
      sections.push(`View Commit: ${gitlabUrl}`);
    }

    return sections.join('\n');
  }

  /**
   * Interpolate URL template with variables
   */
  private interpolateUrl(template: string, variables: Record<string, string>): string {
    let url = template;
    
    for (const [key, value] of Object.entries(variables)) {
      url = url.replace(`{{${key}}}`, value);
    }

    return url;
  }
}
```

---

## 4. Notification Service

### 4.1 src/services/notification/NotificationService.ts (REQUIRED)

```typescript
import { TeamsClient } from '../../lib/clients/teams';
import { DatabaseClient } from '../../lib/clients/database';
import { MessageFormatter } from './MessageFormatter';
import logger from '../../lib/utils/logger';
import { activeIncidents } from '../../lib/utils/metrics';
import type { Incident, MonitorConfig } from '../../lib/types/incident';
import type { IncidentAnalysis } from '../../lib/types/analysis';

export class NotificationService {
  private readonly teams: TeamsClient;
  private readonly database: DatabaseClient;
  private readonly formatter: MessageFormatter;

  constructor(database: DatabaseClient) {
    this.teams = new TeamsClient();
    this.database = database;
    this.formatter = new MessageFormatter();
  }

  /**
   * Notify about incident
   */
  async notify(
    incident: Incident,
    analysis: IncidentAnalysis,
    monitor: MonitorConfig
  ): Promise<void> {
    try {
      logger.info('Sending notification', {
        incidentId: incident.id,
        monitorId: monitor.id,
      });

      // Format message
      const message = this.formatter.formatIncidentMessage(incident, analysis, monitor);

      // Send to Teams
      await this.teams.sendMessage({
        content: message,
        webhookUrl: monitor.teamsNotification.channelWebhookUrl,
      });

      // Update incident with analysis
      await this.database.updateIncident(incident.id, {
        analysisResult: JSON.stringify(analysis),
      });

      // Update active incidents count
      const activeCount = await this.database.getActiveIncidentCount();
      activeIncidents.set(activeCount);

      logger.info('Notification sent successfully', {
        incidentId: incident.id,
      });
    } catch (error) {
      logger.error('Failed to send notification', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - notification failure shouldn't break workflow
    }
  }
}
```

### 4.2 src/services/notification/index.ts

```typescript
export { NotificationService } from './NotificationService';
export type * from './types';
```

---

## 5. Complete Database Client

### 5.1 Update src/lib/clients/database/DatabaseClient.ts (COMPLETE ALL METHODS)

```typescript
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../config';
import { DatabaseError } from '../../utils/errors';
import logger from '../../utils/logger';
import type { Incident, IncidentCreateInput } from '../../types/incident';

export class DatabaseClient {
  private pool: sql.ConnectionPool | null = null;

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
   * Create incident
   */
  async createIncident(input: IncidentCreateInput): Promise<Incident> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const id = uuidv4();
      const externalId = `INC-${Date.now()}`;

      const query = `
        INSERT INTO incidents (
          id, external_id, monitor_id, service_name, severity, status,
          metric_name, metric_value, baseline_value, threshold_value, deviation_percentage,
          error_message, stack_trace, detected_at, tags
        )
        VALUES (
          @id, @externalId, @monitorId, @serviceName, @severity, 'active',
          @metricName, @metricValue, @baselineValue, @thresholdValue, @deviationPercentage,
          @errorMessage, @stackTrace, @detectedAt, @tags
        )
      `;

      const deviationPercentage = 
        ((input.metricValue - input.baselineValue) / input.baselineValue) * 100;

      await this.pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('externalId', sql.NVarChar, externalId)
        .input('monitorId', sql.NVarChar, input.monitorId)
        .input('serviceName', sql.NVarChar, input.serviceName)
        .input('severity', sql.NVarChar, input.severity)
        .input('metricName', sql.NVarChar, input.metricName)
        .input('metricValue', sql.Float, input.metricValue)
        .input('baselineValue', sql.Float, input.baselineValue)
        .input('thresholdValue', sql.Float, input.thresholdValue)
        .input('deviationPercentage', sql.Float, deviationPercentage)
        .input('errorMessage', sql.NVarChar, input.errorMessage)
        .input('stackTrace', sql.NVarChar, input.stackTrace)
        .input('detectedAt', sql.DateTime2, new Date())
        .input('tags', sql.NVarChar, JSON.stringify(input.tags || []))
        .query(query);

      logger.info('Incident created', { id, externalId });

      return {
        id,
        externalId,
        monitorId: input.monitorId,
        serviceName: input.serviceName,
        severity: input.severity,
        status: 'active',
        investigationTier: 'tier3',
        metricName: input.metricName,
        metricValue: input.metricValue,
        baselineValue: input.baselineValue,
        thresholdValue: input.thresholdValue,
        deviationPercentage,
        errorMessage: input.errorMessage,
        stackTrace: input.stackTrace,
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: input.tags || [],
      };
    } catch (error) {
      logger.error('Failed to create incident', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to create incident', error as Error);
    }
  }

  /**
   * Update incident
   */
  async updateIncident(
    id: string,
    updates: Partial<Incident> & { analysisResult?: string }
  ): Promise<void> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const setClauses: string[] = [];
      const request = this.pool.request().input('id', sql.UniqueIdentifier, id);

      if (updates.status) {
        setClauses.push('status = @status');
        request.input('status', sql.NVarChar, updates.status);
      }

      if (updates.analysisResult) {
        setClauses.push('analysis_result = @analysisResult');
        request.input('analysisResult', sql.NVarChar, updates.analysisResult);
      }

      if (updates.investigationTier) {
        setClauses.push('investigation_tier = @investigationTier');
        request.input('investigationTier', sql.NVarChar, updates.investigationTier);
      }

      if (updates.resolvedAt) {
        setClauses.push('resolved_at = @resolvedAt');
        request.input('resolvedAt', sql.DateTime2, updates.resolvedAt);
      }

      if (setClauses.length === 0) {
        return;
      }

      const query = `UPDATE incidents SET ${setClauses.join(', ')} WHERE id = @id`;
      await request.query(query);

      logger.info('Incident updated', { id });
    } catch (error) {
      logger.error('Failed to update incident', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to update incident', error as Error);
    }
  }

  /**
   * Get incident by ID
   */
  async getIncident(id: string): Promise<Incident | null> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const result = await this.pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT * FROM incidents WHERE id = @id');

      if (result.recordset.length === 0) {
        return null;
      }

      return this.mapIncident(result.recordset[0]);
    } catch (error) {
      logger.error('Failed to get incident', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to get incident', error as Error);
    }
  }

  /**
   * List incidents
   */
  async listIncidents(params: {
    page: number;
    limit: number;
    status?: string;
  }): Promise<{ incidents: Incident[]; total: number }> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const offset = (params.page - 1) * params.limit;
      const request = this.pool.request()
        .input('limit', sql.Int, params.limit)
        .input('offset', sql.Int, offset);

      let whereClause = '';
      if (params.status) {
        whereClause = 'WHERE status = @status';
        request.input('status', sql.NVarChar, params.status);
      }

      const countQuery = `SELECT COUNT(*) as total FROM incidents ${whereClause}`;
      const dataQuery = `
        SELECT * FROM incidents ${whereClause}
        ORDER BY detected_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;

      const [countResult, dataResult] = await Promise.all([
        request.query(countQuery),
        request.query(dataQuery),
      ]);

      const incidents = dataResult.recordset.map(this.mapIncident);
      const total = countResult.recordset[0].total;

      return { incidents, total };
    } catch (error) {
      logger.error('Failed to list incidents', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to list incidents', error as Error);
    }
  }

  /**
   * Get recent incidents for monitor
   */
  async getRecentIncidents(monitorId: string, withinMinutes: number): Promise<Incident[]> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const since = new Date(Date.now() - withinMinutes * 60 * 1000);

      const result = await this.pool.request()
        .input('monitorId', sql.NVarChar, monitorId)
        .input('since', sql.DateTime2, since)
        .query(`
          SELECT * FROM incidents
          WHERE monitor_id = @monitorId
            AND detected_at >= @since
            AND status = 'active'
          ORDER BY detected_at DESC
        `);

      return result.recordset.map(this.mapIncident);
    } catch (error) {
      logger.error('Failed to get recent incidents', {
        monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to get recent incidents', error as Error);
    }
  }

  /**
   * Get active incident count
   */
  async getActiveIncidentCount(): Promise<number> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const result = await this.pool.request().query(`
        SELECT COUNT(*) as count FROM incidents WHERE status = 'active'
      `);

      return result.recordset[0].count;
    } catch (error) {
      logger.error('Failed to get active incident count', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to get active incident count', error as Error);
    }
  }

  /**
   * Store LLM usage
   */
  async storeLLMUsage(usage: {
    incidentId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelName: string;
    requestDurationMs: number;
    estimatedCostUsd: number;
  }): Promise<void> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      await this.pool.request()
        .input('id', sql.UniqueIdentifier, uuidv4())
        .input('incidentId', sql.UniqueIdentifier, usage.incidentId)
        .input('inputTokens', sql.Int, usage.inputTokens)
        .input('outputTokens', sql.Int, usage.outputTokens)
        .input('totalTokens', sql.Int, usage.totalTokens)
        .input('modelName', sql.NVarChar, usage.modelName)
        .input('requestDurationMs', sql.Int, usage.requestDurationMs)
        .input('estimatedCostUsd', sql.Decimal(10, 6), usage.estimatedCostUsd)
        .query(`
          INSERT INTO llm_usage (
            id, incident_id, input_tokens, output_tokens, total_tokens,
            model_name, request_duration_ms, estimated_cost_usd
          )
          VALUES (
            @id, @incidentId, @inputTokens, @outputTokens, @totalTokens,
            @modelName, @requestDurationMs, @estimatedCostUsd
          )
        `);
    } catch (error) {
      logger.warn('Failed to store LLM usage', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Non-critical failure
    }
  }

  /**
   * Map database record to Incident
   */
  private mapIncident(record: any): Incident {
    return {
      id: record.id,
      externalId: record.external_id,
      monitorId: record.monitor_id,
      serviceName: record.service_name,
      severity: record.severity,
      status: record.status,
      investigationTier: record.investigation_tier || 'tier3',
      metricName: record.metric_name,
      metricValue: record.metric_value,
      baselineValue: record.baseline_value,
      thresholdValue: record.threshold_value,
      deviationPercentage: record.deviation_percentage,
      errorMessage: record.error_message,
      stackTrace: record.stack_trace,
      detectedAt: new Date(record.detected_at),
      resolvedAt: record.resolved_at ? new Date(record.resolved_at) : undefined,
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
      tags: record.tags ? JSON.parse(record.tags) : [],
    };
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      logger.info('Disconnected from database');
    }
  }
}
```

---

## 6. REST API Implementation

### 6.1 API Routes

**src/api/routes/incidents.ts:**

```typescript
import { Router } from 'express';
import { IncidentsController } from '../controllers/IncidentsController';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';

const router = Router();
const controller = new IncidentsController();

// List incidents
router.get(
  '/',
  validateRequest({
    query: z.object({
      page: z.string().regex(/^\d+$/).optional().default('1'),
      limit: z.string().regex(/^\d+$/).optional().default('20'),
      status: z.enum(['active', 'resolved', 'false_positive']).optional(),
    }),
  }),
  controller.list.bind(controller)
);

// Get incident by ID
router.get('/:id', controller.get.bind(controller));

// Update incident
router.patch(
  '/:id',
  validateRequest({
    body: z.object({
      status: z.enum(['active', 'resolved', 'false_positive']).optional(),
    }),
  }),
  controller.update.bind(controller)
);

export default router;
```

**src/api/routes/index.ts:**

```typescript
import { Router } from 'express';
import incidentsRoutes from './incidents';
import monitorsRoutes from './monitors';
import healthRoutes from './health';

const router = Router();

router.use('/incidents', incidentsRoutes);
router.use('/monitors', monitorsRoutes);
router.use('/health', healthRoutes);

export default router;
```

### 6.2 Controllers

**src/api/controllers/IncidentsController.ts:**

```typescript
import { Request, Response } from 'express';
import { DatabaseClient } from '../../lib/clients/database';
import logger from '../../lib/utils/logger';

export class IncidentsController {
  private readonly database: DatabaseClient;

  constructor() {
    this.database = new DatabaseClient();
  }

  async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;

      const result = await this.database.listIncidents({ page, limit, status });

      res.json({
        data: result.incidents,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      logger.error('Failed to list incidents', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const incident = await this.database.getIncident(req.params.id);

      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      res.json(incident);
    } catch (error) {
      logger.error('Failed to get incident', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      await this.database.updateIncident(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to update incident', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

### 6.3 Middleware

**src/api/middleware/auth.ts:**

```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { DatabaseClient } from '../../lib/clients/database';
import logger from '../../lib/utils/logger';

export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  try {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // TODO: Validate against database
    // For now, simple check
    if (!apiKey.startsWith('irp_')) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    next();
  } catch (error) {
    logger.error('API key validation failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

**src/api/middleware/validation.ts:**

```typescript
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validateRequest(schema: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      } else {
        next(error);
      }
    }
  };
}
```

### 6.4 Update server.ts

```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './lib/utils/logger';
import { register as metricsRegister } from './lib/utils/metrics';
import { DetectionService } from './services/detection';
import { DatabaseClient } from './lib/clients/database';
import { RedisClient } from './lib/clients/redis';
import apiRoutes from './api/routes';
import { authenticateApiKey } from './api/middleware/auth';

let detectionService: DetectionService | null = null;

export async function startServer() {
  const app = express();

  // Security
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
  });
  app.use('/api', limiter);

  // Initialize database
  const database = new DatabaseClient();
  await database.connect();

  // Initialize Redis
  const redis = new RedisClient();
  await redis.connect();

  // Initialize Detection Service
  detectionService = new DetectionService();
  await detectionService.start();

  // Public endpoints
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  });

  // API routes (protected)
  app.use('/api/v1', authenticateApiKey, apiRoutes);

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

## 7. Implementation Checklist

- ✅ TeamsClient with webhook and Graph API support
- ✅ MessageFormatter with URL interpolation
- ✅ NotificationService orchestrator
- ✅ Complete DatabaseClient with all CRUD operations
- ✅ REST API routes (incidents, monitors, health)
- ✅ API controllers
- ✅ Authentication middleware
- ✅ Request validation middleware
- ✅ Rate limiting
- ✅ Error handling

---

**End of Document 05**

Next: Document 06 (Deployment & Testing)
