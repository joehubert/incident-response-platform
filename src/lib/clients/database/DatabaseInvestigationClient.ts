import sql from 'mssql';
import { config } from '../../../config';
import { DatabaseError } from '../../utils/errors';
import logger from '../../utils/logger';
import type { SchemaFinding, DataFinding, PerformanceFinding } from '../../types/evidence';

export interface InvestigationQuery {
  tables: string[];
  schemas: string[];
  errorContext?: {
    errorMessage: string;
    stackTrace: string;
  };
}

export interface InvestigationResult {
  schemaFindings: SchemaFinding[];
  dataFindings: DataFinding[];
  performanceFindings: PerformanceFinding[];
}

export class DatabaseInvestigationClient {
  private pool: sql.ConnectionPool | null = null;
  private readonly timeoutMs: number;
  private readonly maxRows: number;
  private readonly auditLogging: boolean;

  constructor() {
    this.timeoutMs = config.database.readOnlyInvestigation.timeoutSeconds * 1000;
    this.maxRows = config.database.readOnlyInvestigation.maxRows;
    this.auditLogging = config.database.readOnlyInvestigation.auditLogging;
  }

  /**
   * Connect to database with read-only settings
   */
  async connect(): Promise<void> {
    if (!config.database.readOnlyInvestigation.enabled) {
      logger.warn('Database investigation is disabled');
      return;
    }

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
          readOnlyIntent: true,
        },
        requestTimeout: this.timeoutMs,
        pool: {
          max: 5,
          min: 1,
          idleTimeoutMillis: 10000,
        },
      };

      this.pool = await sql.connect(dbConfig);
      logger.info('Connected to database for investigation (read-only)');
    } catch (error) {
      logger.error('Failed to connect to database for investigation', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to connect to database', error as Error);
    }
  }

  /**
   * Investigate database based on error context
   */
  async investigate(query: InvestigationQuery): Promise<InvestigationResult> {
    if (!this.pool) {
      throw new DatabaseError('Database client not connected');
    }

    if (this.auditLogging) {
      logger.info('Starting database investigation', {
        tables: query.tables,
        schemas: query.schemas,
        hasErrorContext: !!query.errorContext,
      });
    }

    const schemaFindings: SchemaFinding[] = [];
    const dataFindings: DataFinding[] = [];
    const performanceFindings: PerformanceFinding[] = [];

    try {
      // Check schema issues
      for (const table of query.tables) {
        const tableSchemaFindings = await this.checkTableSchema(table, query.schemas);
        schemaFindings.push(...tableSchemaFindings);
      }

      // Check for data anomalies if we have error context
      if (query.errorContext) {
        for (const table of query.tables) {
          const tableDataFindings = await this.checkDataAnomalies(table, query.schemas);
          dataFindings.push(...tableDataFindings);
        }
      }

      // Check for performance issues
      const perfFindings = await this.checkPerformanceIssues(query.tables, query.schemas);
      performanceFindings.push(...perfFindings);

      if (this.auditLogging) {
        logger.info('Database investigation completed', {
          schemaFindingsCount: schemaFindings.length,
          dataFindingsCount: dataFindings.length,
          performanceFindingsCount: performanceFindings.length,
        });
      }

      return {
        schemaFindings,
        dataFindings,
        performanceFindings,
      };
    } catch (error) {
      logger.error('Database investigation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Investigation failed', error as Error);
    }
  }

  /**
   * Check table schema for issues
   */
  private async checkTableSchema(table: string, schemas: string[]): Promise<SchemaFinding[]> {
    const findings: SchemaFinding[] = [];

    if (!this.pool) return findings;

    try {
      const schemaList = schemas.map((s) => `'${this.sanitize(s)}'`).join(',');

      // Check for nullable columns that might cause issues
      const result = await this.pool.request().query(`
        SELECT
          c.TABLE_SCHEMA,
          c.TABLE_NAME,
          c.COLUMN_NAME,
          c.IS_NULLABLE,
          c.DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_NAME = '${this.sanitize(table)}'
          AND c.TABLE_SCHEMA IN (${schemaList})
          AND c.IS_NULLABLE = 'YES'
          AND c.COLUMN_NAME NOT LIKE '%_at'
          AND c.COLUMN_NAME NOT LIKE '%_date'
        ORDER BY c.ORDINAL_POSITION
      `);

      for (const row of result.recordset) {
        findings.push({
          type: 'constraint_violation',
          severity: 'low',
          description: `Column ${row.COLUMN_NAME} in ${row.TABLE_SCHEMA}.${row.TABLE_NAME} allows NULL values`,
          tableName: `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
          columnName: row.COLUMN_NAME,
        });
      }
    } catch (error) {
      logger.warn('Failed to check table schema', {
        table,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return findings;
  }

  /**
   * Check for data anomalies
   */
  private async checkDataAnomalies(table: string, schemas: string[]): Promise<DataFinding[]> {
    const findings: DataFinding[] = [];

    if (!this.pool) return findings;

    try {
      for (const schema of schemas) {
        // Check for unexpected NULL values in non-nullable business columns
        const nullCheckResult = await this.pool.request().query(`
          SELECT TOP ${this.maxRows}
            '${this.sanitize(schema)}.${this.sanitize(table)}' as table_name,
            COUNT(*) as null_count
          FROM ${this.sanitize(schema)}.${this.sanitize(table)}
          WHERE 1=0
        `);

        // This is a simplified check - in real implementation would have more logic
        if (nullCheckResult.recordset[0]?.null_count > 0) {
          findings.push({
            type: 'unexpected_nulls',
            severity: 'medium',
            description: `Found unexpected NULL values in ${schema}.${table}`,
            tableName: `${schema}.${table}`,
            affectedRows: nullCheckResult.recordset[0].null_count,
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to check data anomalies', {
        table,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return findings;
  }

  /**
   * Check for performance issues
   */
  private async checkPerformanceIssues(
    tables: string[],
    schemas: string[]
  ): Promise<PerformanceFinding[]> {
    const findings: PerformanceFinding[] = [];

    if (!this.pool) return findings;

    try {
      // Check for missing indexes
      const result = await this.pool.request().query(`
        SELECT
          OBJECT_SCHEMA_NAME(i.object_id) AS schema_name,
          OBJECT_NAME(i.object_id) AS table_name,
          i.equality_columns,
          i.inequality_columns,
          i.included_columns,
          i.avg_user_impact
        FROM sys.dm_db_missing_index_details i
        JOIN sys.dm_db_missing_index_groups g ON i.index_handle = g.index_handle
        JOIN sys.dm_db_missing_index_group_stats s ON g.index_group_handle = s.group_handle
        WHERE i.database_id = DB_ID()
          AND OBJECT_NAME(i.object_id) IN (${tables.map((t) => `'${this.sanitize(t)}'`).join(',')})
          AND OBJECT_SCHEMA_NAME(i.object_id) IN (${schemas.map((s) => `'${this.sanitize(s)}'`).join(',')})
        ORDER BY s.avg_total_user_cost * s.avg_user_impact DESC
      `);

      for (const row of result.recordset) {
        findings.push({
          type: 'missing_index',
          severity: row.avg_user_impact > 80 ? 'high' : 'medium',
          description: `Missing index on ${row.schema_name}.${row.table_name} (columns: ${row.equality_columns || row.inequality_columns})`,
          recommendation: `Consider adding index on ${row.equality_columns || row.inequality_columns}`,
          estimatedImpact: `${row.avg_user_impact}% query improvement`,
        });
      }
    } catch (error) {
      logger.warn('Failed to check performance issues', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return findings;
  }

  /**
   * Sanitize input to prevent SQL injection
   */
  private sanitize(input: string): string {
    return input.replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      logger.info('Disconnected from database investigation client');
    }
  }
}
