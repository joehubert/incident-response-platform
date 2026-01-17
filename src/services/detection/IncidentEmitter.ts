import { DatabaseClient } from '../../lib/clients/database';
import logger from '../../lib/utils/logger';
import { incidentsDetected, activeIncidents } from '../../lib/utils/metrics';
import type { Incident, IncidentCreateInput } from '../../lib/types/incident';

export class IncidentEmitter {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * Create a new incident from anomaly detection
   */
  async createIncident(input: IncidentCreateInput): Promise<Incident> {
    try {
      logger.info('Creating incident', {
        monitorId: input.monitorId,
        serviceName: input.serviceName,
        severity: input.severity,
      });

      const incident = await this.database.createIncident(input);

      // Update metrics
      incidentsDetected.inc({
        monitor_id: input.monitorId,
        severity: input.severity,
        tier: 'unknown', // Will be updated during investigation
      });

      // Update active incidents gauge
      const activeCount = await this.database.getActiveIncidentCount();
      activeIncidents.set(activeCount);

      logger.info('Incident created', {
        incidentId: incident.id,
        monitorId: input.monitorId,
        severity: input.severity,
      });

      return incident;
    } catch (error) {
      logger.error('Failed to create incident', {
        monitorId: input.monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if incident already exists for this monitor (deduplication)
   */
  async hasActiveIncident(monitorId: string, withinMinutes: number = 5): Promise<boolean> {
    try {
      const incidents = await this.database.getRecentIncidents(monitorId, withinMinutes);
      return incidents.length > 0;
    } catch (error) {
      logger.error('Failed to check for active incident', {
        monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false; // Assume no active incident on error
    }
  }
}
