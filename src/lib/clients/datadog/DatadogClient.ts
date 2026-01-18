import axios, { AxiosInstance } from 'axios';
import { config } from '../../../config';
import { ExternalAPIError } from '../../utils/errors';
import logger from '../../utils/logger';
import { externalApiCalls, externalApiDuration } from '../../utils/metrics';
import type { MetricValue } from '../../types/common';

export interface DatadogMetricsQuery {
  query: string;
  from: number; // Unix timestamp
  to: number; // Unix timestamp
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

    const baseURL = this.site.startsWith('http')
      ? this.site
      : `https://api.${this.site}`;

    this.client = axios.create({
      baseURL,
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
        count: values.length,
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
      endpoint: 'error-tracking',
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
      endpoint: 'events',
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

      const events = await this.queryDeploymentEvents([`service:${serviceName}`], oneHourAgo, now);

      return events.length > 0;
    } catch {
      return false;
    }
  }
}
