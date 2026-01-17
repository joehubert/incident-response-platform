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

export class DetectionService {
  private readonly datadog: DatadogClient;
  private readonly redis: RedisClient;
  private readonly database: DatabaseClient;
  private readonly baselineCalculator: BaselineCalculator;
  private readonly anomalyDetector: AnomalyDetector;
  private readonly monitorManager: MonitorManager;
  private readonly incidentEmitter: IncidentEmitter;

  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor(datadog: DatadogClient, redis: RedisClient, database: DatabaseClient) {
    this.datadog = datadog;
    this.redis = redis;
    this.database = database;

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
    for (const interval of this.pollingIntervals.values()) {
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
