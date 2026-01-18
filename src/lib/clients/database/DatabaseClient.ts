import sql from 'mssql';
import crypto from 'crypto';
import { config } from '../../../config';
import { DatabaseError } from '../../utils/errors';
import logger from '../../utils/logger';
import type { Incident, IncidentCreateInput } from '../../types/incident';
import type { IncidentStatus } from '../../types/common';
import type { LLMUsageRecord } from '../../types/analysis';

/**
 * Input for storing LLM usage records
 */
export interface LLMUsageInput {
  incidentId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelName: string;
  requestDurationMs: number;
  estimatedCostUsd: number;
}

/**
 * Input for updating incidents
 */
export interface IncidentUpdateInput {
  status?: IncidentStatus;
  investigationTier?: string;
  resolvedAt?: Date;
  analysisResult?: string;
}

/**
 * Parameters for listing incidents
 */
export interface ListIncidentsParams {
  page: number;
  limit: number;
  status?: IncidentStatus;
  severity?: string;
  monitorId?: string;
}

/**
 * Result of listing incidents
 */
export interface ListIncidentsResult {
  incidents: Incident[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
   * Create a new incident
   */
  async createIncident(input: IncidentCreateInput): Promise<Incident> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const id = crypto.randomUUID();
      const externalId = `INC-${Date.now()}`;
      const now = new Date();
      const deviationPercentage =
        ((input.metricValue - input.baselineValue) / input.baselineValue) * 100;

      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, id);
      request.input('externalId', sql.NVarChar(50), externalId);
      request.input('monitorId', sql.NVarChar(100), input.monitorId);
      request.input('serviceName', sql.NVarChar(200), input.serviceName);
      request.input('severity', sql.NVarChar(20), input.severity);
      request.input('status', sql.NVarChar(20), 'active');
      request.input('investigationTier', sql.NVarChar(10), 'tier3');
      request.input('metricName', sql.NVarChar(200), input.metricName);
      request.input('metricValue', sql.Float, input.metricValue);
      request.input('baselineValue', sql.Float, input.baselineValue);
      request.input('thresholdValue', sql.Float, input.thresholdValue);
      request.input('deviationPercentage', sql.Float, deviationPercentage);
      request.input('errorMessage', sql.NVarChar(sql.MAX), input.errorMessage || null);
      request.input('stackTrace', sql.NVarChar(sql.MAX), input.stackTrace || null);
      request.input('detectedAt', sql.DateTime2, now);
      request.input('createdAt', sql.DateTime2, now);
      request.input('updatedAt', sql.DateTime2, now);
      request.input('tags', sql.NVarChar(sql.MAX), JSON.stringify(input.tags || []));

      await request.query(`
        INSERT INTO Incidents (
          id, external_id, monitor_id, service_name, severity, status,
          investigation_tier, metric_name, metric_value, baseline_value,
          threshold_value, deviation_percentage, error_message, stack_trace,
          detected_at, created_at, updated_at, tags
        )
        VALUES (
          @id, @externalId, @monitorId, @serviceName, @severity, @status,
          @investigationTier, @metricName, @metricValue, @baselineValue,
          @thresholdValue, @deviationPercentage, @errorMessage, @stackTrace,
          @detectedAt, @createdAt, @updatedAt, @tags
        )
      `);

      logger.info('Incident created', { id, externalId, monitorId: input.monitorId });

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
        detectedAt: now,
        createdAt: now,
        updatedAt: now,
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
   * Get incident by ID
   */
  async getIncident(id: string): Promise<Incident | null> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, id);

      const result = await request.query('SELECT * FROM Incidents WHERE id = @id');

      if (result.recordset.length === 0) {
        return null;
      }

      return this.mapIncidentRow(result.recordset[0]);
    } catch (error) {
      logger.error('Failed to get incident', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to get incident', error as Error);
    }
  }

  /**
   * Update incident
   */
  async updateIncident(id: string, updates: IncidentUpdateInput): Promise<void> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const setClauses: string[] = ['updated_at = @updatedAt'];
      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, id);
      request.input('updatedAt', sql.DateTime2, new Date());

      if (updates.status !== undefined) {
        setClauses.push('status = @status');
        request.input('status', sql.NVarChar(20), updates.status);
      }

      if (updates.investigationTier !== undefined) {
        setClauses.push('investigation_tier = @investigationTier');
        request.input('investigationTier', sql.NVarChar(10), updates.investigationTier);
      }

      if (updates.resolvedAt !== undefined) {
        setClauses.push('resolved_at = @resolvedAt');
        request.input('resolvedAt', sql.DateTime2, updates.resolvedAt);
      }

      if (updates.analysisResult !== undefined) {
        setClauses.push('analysis_result = @analysisResult');
        request.input('analysisResult', sql.NVarChar(sql.MAX), updates.analysisResult);
      }

      const query = `UPDATE Incidents SET ${setClauses.join(', ')} WHERE id = @id`;
      await request.query(query);

      logger.info('Incident updated', { id, updates: Object.keys(updates) });
    } catch (error) {
      logger.error('Failed to update incident', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to update incident', error as Error);
    }
  }

  /**
   * List incidents with pagination and filtering
   */
  async listIncidents(params: ListIncidentsParams): Promise<ListIncidentsResult> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const offset = (params.page - 1) * params.limit;
      const whereClauses: string[] = [];
      const countRequest = this.pool.request();
      const dataRequest = this.pool.request();

      // Apply filters
      if (params.status) {
        whereClauses.push('status = @status');
        countRequest.input('status', sql.NVarChar(20), params.status);
        dataRequest.input('status', sql.NVarChar(20), params.status);
      }

      if (params.severity) {
        whereClauses.push('severity = @severity');
        countRequest.input('severity', sql.NVarChar(20), params.severity);
        dataRequest.input('severity', sql.NVarChar(20), params.severity);
      }

      if (params.monitorId) {
        whereClauses.push('monitor_id = @monitorId');
        countRequest.input('monitorId', sql.NVarChar(100), params.monitorId);
        dataRequest.input('monitorId', sql.NVarChar(100), params.monitorId);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM Incidents ${whereClause}`;
      const countResult = await countRequest.query(countQuery);
      const total = countResult.recordset[0].total;

      // Get paginated data
      dataRequest.input('limit', sql.Int, params.limit);
      dataRequest.input('offset', sql.Int, offset);

      const dataQuery = `
        SELECT * FROM Incidents ${whereClause}
        ORDER BY detected_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;
      const dataResult = await dataRequest.query(dataQuery);

      const incidents = dataResult.recordset.map(this.mapIncidentRow);

      return {
        incidents,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      };
    } catch (error) {
      logger.error('Failed to list incidents', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to list incidents', error as Error);
    }
  }

  /**
   * Get recent incidents for a monitor
   */
  async getRecentIncidents(monitorId: string, withinMinutes: number): Promise<Incident[]> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const since = new Date(Date.now() - withinMinutes * 60 * 1000);
      const request = this.pool.request();
      request.input('monitorId', sql.NVarChar(100), monitorId);
      request.input('since', sql.DateTime2, since);

      const result = await request.query(`
        SELECT * FROM Incidents
        WHERE monitor_id = @monitorId
          AND detected_at >= @since
          AND status = 'active'
        ORDER BY detected_at DESC
      `);

      return result.recordset.map(this.mapIncidentRow);
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
        SELECT COUNT(*) as count FROM Incidents WHERE status = 'active'
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
   * Map database row to Incident object
   */
  private mapIncidentRow(row: Record<string, unknown>): Incident {
    return {
      id: row.id as string,
      externalId: row.external_id as string,
      monitorId: row.monitor_id as string,
      serviceName: row.service_name as string,
      severity: row.severity as Incident['severity'],
      status: row.status as Incident['status'],
      investigationTier: (row.investigation_tier as Incident['investigationTier']) || 'tier3',
      metricName: row.metric_name as string,
      metricValue: row.metric_value as number,
      baselineValue: row.baseline_value as number,
      thresholdValue: row.threshold_value as number,
      deviationPercentage: row.deviation_percentage as number,
      errorMessage: row.error_message as string | undefined,
      stackTrace: row.stack_trace as string | undefined,
      detectedAt: new Date(row.detected_at as string),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      tags: row.tags ? JSON.parse(row.tags as string) : [],
    };
  }

  /**
   * Store LLM usage record for cost tracking
   */
  async storeLLMUsage(input: LLMUsageInput): Promise<LLMUsageRecord> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const id = crypto.randomUUID();
      const createdAt = new Date();

      const request = this.pool.request();
      request.input('id', sql.UniqueIdentifier, id);
      request.input('incidentId', sql.VarChar(50), input.incidentId);
      request.input('inputTokens', sql.Int, input.inputTokens);
      request.input('outputTokens', sql.Int, input.outputTokens);
      request.input('totalTokens', sql.Int, input.totalTokens);
      request.input('modelName', sql.VarChar(100), input.modelName);
      request.input('requestDurationMs', sql.Int, input.requestDurationMs);
      request.input('estimatedCostUsd', sql.Decimal(10, 6), input.estimatedCostUsd);
      request.input('createdAt', sql.DateTime2, createdAt);

      await request.query(`
        INSERT INTO LLMUsage (
          id, incident_id, input_tokens, output_tokens, total_tokens,
          model_name, request_duration_ms, estimated_cost_usd, created_at
        )
        VALUES (
          @id, @incidentId, @inputTokens, @outputTokens, @totalTokens,
          @modelName, @requestDurationMs, @estimatedCostUsd, @createdAt
        )
      `);

      logger.debug('Stored LLM usage record', {
        id,
        incidentId: input.incidentId,
        totalTokens: input.totalTokens,
        estimatedCostUsd: input.estimatedCostUsd,
      });

      return {
        id,
        incidentId: input.incidentId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        modelName: input.modelName,
        requestDurationMs: input.requestDurationMs,
        estimatedCostUsd: input.estimatedCostUsd,
        createdAt,
      };
    } catch (error) {
      logger.error('Failed to store LLM usage', {
        incidentId: input.incidentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to store LLM usage', error as Error);
    }
  }

  /**
   * Get LLM usage for an incident
   */
  async getLLMUsageByIncident(incidentId: string): Promise<LLMUsageRecord[]> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const request = this.pool.request();
      request.input('incidentId', sql.VarChar(50), incidentId);

      const result = await request.query(`
        SELECT
          id, incident_id, input_tokens, output_tokens, total_tokens,
          model_name, request_duration_ms, estimated_cost_usd, created_at
        FROM LLMUsage
        WHERE incident_id = @incidentId
        ORDER BY created_at DESC
      `);

      return result.recordset.map((row) => ({
        id: row.id,
        incidentId: row.incident_id,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        modelName: row.model_name,
        requestDurationMs: row.request_duration_ms,
        estimatedCostUsd: Number.parseFloat(row.estimated_cost_usd),
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Failed to get LLM usage', {
        incidentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to get LLM usage', error as Error);
    }
  }

  /**
   * Get total LLM cost for a time period
   */
  async getTotalLLMCost(startDate: Date, endDate: Date): Promise<number> {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }

    try {
      const request = this.pool.request();
      request.input('startDate', sql.DateTime2, startDate);
      request.input('endDate', sql.DateTime2, endDate);

      const result = await request.query(`
        SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_cost
        FROM LLMUsage
        WHERE created_at >= @startDate AND created_at <= @endDate
      `);

      return Number.parseFloat(result.recordset[0].total_cost) || 0;
    } catch (error) {
      logger.error('Failed to get total LLM cost', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to get total LLM cost', error as Error);
    }
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
