import { TeamsClient } from '../../lib/clients/teams';
import { DatabaseClient } from '../../lib/clients/database';
import { MessageFormatter } from './MessageFormatter';
import logger from '../../lib/utils/logger';
import { activeIncidents } from '../../lib/utils/metrics';
import type { Incident, MonitorConfig } from '../../lib/types/incident';
import type { IncidentAnalysis } from '../../lib/types/analysis';
import type { NotificationResult } from './types';

/**
 * Notification service for sending incident alerts to MS Teams
 * and updating incident records in the database
 */
export class NotificationService {
  private readonly teams: TeamsClient;
  private readonly database: DatabaseClient;
  private readonly formatter: MessageFormatter;

  constructor(database: DatabaseClient) {
    this.teams = new TeamsClient();
    this.database = database;
    this.formatter = new MessageFormatter();
  }

  /**
   * Send notification about a new incident
   */
  async notify(
    incident: Incident,
    analysis: IncidentAnalysis,
    monitor: MonitorConfig
  ): Promise<NotificationResult> {
    try {
      logger.info('Sending incident notification', {
        incidentId: incident.id,
        monitorId: monitor.id,
        severity: incident.severity,
      });

      // Format the message
      const message = this.formatter.formatIncidentMessage(incident, analysis, monitor);

      // Determine webhook URL
      const webhookUrl = monitor.teamsNotification.channelWebhookUrl;

      if (!webhookUrl && !this.teams.isConfigured()) {
        logger.warn('No Teams channel configured for notification', {
          incidentId: incident.id,
          monitorId: monitor.id,
        });
        return {
          success: false,
          channelUsed: 'webhook',
          error: 'No Teams channel configured',
        };
      }

      // Send to Teams
      const sendResult = await this.teams.sendMessage({
        content: message,
        webhookUrl,
      });

      // Update incident with analysis in database
      await this.updateIncidentWithAnalysis(incident.id, analysis);

      // Update active incidents metric
      await this.updateActiveIncidentsMetric();

      logger.info('Incident notification sent successfully', {
        incidentId: incident.id,
        messageId: sendResult.messageId,
      });

      return {
        success: true,
        channelUsed: webhookUrl ? 'webhook' : 'graph',
        messageId: sendResult.messageId,
      };
    } catch (error) {
      logger.error('Failed to send incident notification', {
        incidentId: incident.id,
        monitorId: monitor.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - notification failure shouldn't break the workflow
      return {
        success: false,
        channelUsed: 'webhook',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send a compact notification (for follow-up updates)
   */
  async notifyCompact(
    incident: Incident,
    analysis: IncidentAnalysis,
    webhookUrl: string
  ): Promise<NotificationResult> {
    try {
      const message = this.formatter.formatCompactMessage(incident, analysis);

      const sendResult = await this.teams.sendMessage({
        content: message,
        webhookUrl,
      });

      return {
        success: true,
        channelUsed: 'webhook',
        messageId: sendResult.messageId,
      };
    } catch (error) {
      logger.error('Failed to send compact notification', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        channelUsed: 'webhook',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send resolution notification
   */
  async notifyResolution(incident: Incident, webhookUrl: string): Promise<NotificationResult> {
    try {
      const message = this.formatter.formatResolutionMessage(incident);

      const sendResult = await this.teams.sendMessage({
        content: message,
        webhookUrl,
      });

      // Update active incidents metric
      await this.updateActiveIncidentsMetric();

      return {
        success: true,
        channelUsed: 'webhook',
        messageId: sendResult.messageId,
      };
    } catch (error) {
      logger.error('Failed to send resolution notification', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        channelUsed: 'webhook',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update incident with analysis results
   */
  private async updateIncidentWithAnalysis(
    incidentId: string,
    analysis: IncidentAnalysis
  ): Promise<void> {
    try {
      await this.database.updateIncident(incidentId, {
        analysisResult: JSON.stringify(analysis),
      });
    } catch (error) {
      logger.error('Failed to update incident with analysis', {
        incidentId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Update the active incidents metric
   */
  private async updateActiveIncidentsMetric(): Promise<void> {
    try {
      const count = await this.database.getActiveIncidentCount();
      activeIncidents.set(count);
    } catch (error) {
      logger.warn('Failed to update active incidents metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if notification service is properly configured
   */
  isConfigured(): boolean {
    return this.teams.isConfigured();
  }

  /**
   * Get service status
   */
  getStatus(): { teamsConfigured: boolean; teamsStatus: { webhookConfigured: boolean; graphConfigured: boolean } } {
    return {
      teamsConfigured: this.teams.isConfigured(),
      teamsStatus: this.teams.getStatus(),
    };
  }
}
