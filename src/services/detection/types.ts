import type { AnomalyDetectionResult } from '../../lib/types/incident';
import type { BaselineData, MetricValue } from '../../lib/types/common';

export interface DetectionResult {
  monitorId: string;
  isAnomaly: boolean;
  anomalyDetails?: AnomalyDetectionResult;
  checkedAt: Date;
}

export interface BaselineCache {
  monitorId: string;
  hourOfDay: number;
  baseline: BaselineData;
}

export interface MetricQueryResult {
  monitorId: string;
  values: MetricValue[];
  queriedAt: Date;
}

export interface PollingSchedule {
  monitorId: string;
  intervalSeconds: number;
  lastPollTime?: Date;
  nextPollTime: Date;
}
