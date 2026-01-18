import { Request, Response } from 'express';
import { DatabaseClient } from '../../lib/clients/database';
import { RedisClient } from '../../lib/clients/redis';
import logger from '../../lib/utils/logger';
import type { HealthStatus, ComponentHealth } from '../../lib/types/common';

/**
 * Health check API controller
 */
export class HealthController {
  private readonly version: string;

  constructor(
    private readonly database: DatabaseClient,
    private readonly redis: RedisClient
  ) {
    this.version = process.env.APP_VERSION || '1.0.0';
  }

  /**
   * Basic health check (fast, no dependencies)
   */
  async liveness(_req: Request, res: Response): Promise<void> {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Detailed health check (checks all dependencies)
   */
  async readiness(_req: Request, res: Response): Promise<void> {
    try {
      const checks = await this.runHealthChecks();

      const overallStatus = this.determineOverallStatus(checks);

      const response: HealthStatus = {
        status: overallStatus,
        version: this.version,
        timestamp: new Date().toISOString(),
        checks,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

      res.status(statusCode).json(response);
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(503).json({
        status: 'unhealthy',
        version: this.version,
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(): Promise<HealthStatus['checks']> {
    const [database, redis, datadog, llm] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkDatadog(),
      this.checkLLM(),
    ]);

    return {
      database,
      redis,
      datadog,
      llm,
    };
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Try a simple query
      await this.database.getActiveIncidentCount();

      return {
        status: 'up',
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Try to ping Redis
      const pong = await this.redis.ping();

      if (pong === 'PONG') {
        return {
          status: 'up',
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        status: 'down',
        latencyMs: Date.now() - startTime,
        error: 'Unexpected ping response',
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Datadog API health (placeholder)
   */
  private async checkDatadog(): Promise<ComponentHealth> {
    // For MVP, just report as up if configuration is present
    // In production, this would make an actual API call
    return {
      status: 'up',
      latencyMs: 0,
    };
  }

  /**
   * Check LLM API health (placeholder)
   */
  private async checkLLM(): Promise<ComponentHealth> {
    // For MVP, just report as up if configuration is present
    // In production, this would make an actual API call
    return {
      status: 'up',
      latencyMs: 0,
    };
  }

  /**
   * Determine overall status based on component checks
   */
  private determineOverallStatus(
    checks: HealthStatus['checks']
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const criticalServices = [checks.database, checks.redis];
    const optionalServices = [checks.datadog, checks.llm];

    // If any critical service is down, we're unhealthy
    if (criticalServices.some((c) => c.status === 'down')) {
      return 'unhealthy';
    }

    // If any optional service is down, we're degraded
    if (optionalServices.some((c) => c.status === 'down')) {
      return 'degraded';
    }

    return 'healthy';
  }
}
