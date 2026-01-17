import { AnomalyDetector } from '../../../../src/services/detection/AnomalyDetector';
import type { MonitorConfig } from '../../../../src/lib/types/incident';
import type { BaselineData, MetricValue } from '../../../../src/lib/types/common';

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector();
  });

  describe('detectAnomaly', () => {
    const createMonitor = (thresholdType: 'absolute' | 'percentage' | 'multiplier'): MonitorConfig =>
      ({
        id: 'test-monitor',
        name: 'Test Monitor',
        threshold: {
          type: thresholdType,
          warning: 50,
          critical: 100,
        },
      }) as MonitorConfig;

    const createBaseline = (averageValue: number): BaselineData => ({
      averageValue,
      standardDeviation: 5,
      sampleCount: 7,
      hourOfDay: 10,
      calculatedAt: new Date(),
    });

    describe('absolute threshold', () => {
      it('should detect critical anomaly when value exceeds critical threshold', () => {
        const monitor = createMonitor('absolute');
        const baseline = createBaseline(20);

        const result = detector.detectAnomaly(monitor, 150, baseline);

        expect(result).not.toBeNull();
        expect(result?.isAnomaly).toBe(true);
        expect(result?.severity).toBe('critical');
        expect(result?.currentValue).toBe(150);
      });

      it('should not detect anomaly when value is below critical threshold', () => {
        const monitor = createMonitor('absolute');
        const baseline = createBaseline(20);

        const result = detector.detectAnomaly(monitor, 30, baseline);

        expect(result).toBeNull();
      });
    });

    describe('percentage threshold', () => {
      it('should detect critical anomaly when percentage change exceeds critical', () => {
        const monitor = createMonitor('percentage');
        const baseline = createBaseline(100);

        // 250% increase from 100 -> 350
        const result = detector.detectAnomaly(monitor, 350, baseline);

        expect(result).not.toBeNull();
        expect(result?.isAnomaly).toBe(true);
        expect(result?.severity).toBe('critical');
      });

      it('should not detect anomaly when percentage change is below critical', () => {
        const monitor = createMonitor('percentage');
        const baseline = createBaseline(100);

        // Only 10% increase
        const result = detector.detectAnomaly(monitor, 110, baseline);

        expect(result).toBeNull();
      });
    });

    describe('multiplier threshold', () => {
      it('should detect critical anomaly when multiplier exceeds critical', () => {
        const monitor = {
          id: 'test-monitor',
          name: 'Test Monitor',
          threshold: {
            type: 'multiplier' as const,
            warning: 2,
            critical: 5,
          },
        } as MonitorConfig;
        const baseline = createBaseline(10);

        // 6x multiplier (60 / 10 = 6), exceeds critical of 5
        const result = detector.detectAnomaly(monitor, 60, baseline);

        expect(result).not.toBeNull();
        expect(result?.isAnomaly).toBe(true);
        expect(result?.severity).toBe('critical');
      });

      it('should not detect anomaly when multiplier is below critical', () => {
        const monitor = {
          id: 'test-monitor',
          name: 'Test Monitor',
          threshold: {
            type: 'multiplier' as const,
            warning: 2,
            critical: 5,
          },
        } as MonitorConfig;
        const baseline = createBaseline(10);

        // Only 3x multiplier (30 / 10 = 3), below critical of 5
        const result = detector.detectAnomaly(monitor, 30, baseline);

        expect(result).toBeNull();
      });
    });
  });

  describe('getLatestValue', () => {
    it('should return the latest value by timestamp', () => {
      const values: MetricValue[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 10 },
        { timestamp: new Date('2024-01-01T12:00:00Z'), value: 30 },
        { timestamp: new Date('2024-01-01T11:00:00Z'), value: 20 },
      ];

      const result = detector.getLatestValue(values);

      expect(result).toBe(30);
    });

    it('should return null for empty array', () => {
      const result = detector.getLatestValue([]);

      expect(result).toBeNull();
    });
  });

  describe('getAverageValue', () => {
    it('should return the average of all values', () => {
      const values: MetricValue[] = [
        { timestamp: new Date(), value: 10 },
        { timestamp: new Date(), value: 20 },
        { timestamp: new Date(), value: 30 },
      ];

      const result = detector.getAverageValue(values);

      expect(result).toBe(20);
    });

    it('should return null for empty array', () => {
      const result = detector.getAverageValue([]);

      expect(result).toBeNull();
    });
  });
});
