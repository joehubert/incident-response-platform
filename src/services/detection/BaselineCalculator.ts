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
    await this.redis.setex(cacheKey, 86400, JSON.stringify(baseline));

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
      const targetTime = now - day * 86400; // Go back 'day' days
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
