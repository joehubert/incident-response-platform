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
        severity =
          currentValue > threshold.critical
            ? 'critical'
            : currentValue > threshold.warning
              ? 'high'
              : 'low';
        thresholdValue = isAnomaly ? threshold.critical : threshold.warning;
        break;

      case 'percentage': {
        // Current value changed by percentage from baseline
        const percentChange = Math.abs(((currentValue - baselineValue) / baselineValue) * 100);
        isAnomaly = percentChange > threshold.critical;
        severity =
          percentChange > threshold.critical
            ? 'critical'
            : percentChange > threshold.warning
              ? 'high'
              : 'low';
        thresholdValue = baselineValue * (1 + threshold.critical / 100);
        break;
      }

      case 'multiplier': {
        // Current value is multiplier times baseline
        const multiplier = currentValue / baselineValue;
        isAnomaly = multiplier > threshold.critical;
        severity =
          multiplier > threshold.critical
            ? 'critical'
            : multiplier > threshold.warning
              ? 'high'
              : 'low';
        thresholdValue = baselineValue * threshold.critical;
        break;
      }
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
