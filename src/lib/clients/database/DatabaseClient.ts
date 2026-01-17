import sql from 'mssql';
import crypto from 'crypto';
import { config } from '../../../config';
import { DatabaseError } from '../../utils/errors';
import logger from '../../utils/logger';
import type { Incident, IncidentCreateInput } from '../../types/incident';
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
  async createIncident(_input: IncidentCreateInput): Promise<Incident> {
    // TODO: Implement in next document
    throw new Error('Not implemented yet');
  }

  /**
   * Get recent incidents for a monitor (STUB)
   */
  async getRecentIncidents(_monitorId: string, _withinMinutes: number): Promise<Incident[]> {
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
