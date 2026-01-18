import type { Incident, MonitorConfig } from '../../lib/types/incident';
import type { IncidentAnalysis } from '../../lib/types/analysis';

/**
 * Formats incident messages for MS Teams notifications
 */
export class MessageFormatter {
  /**
   * Format incident notification message
   */
  formatIncidentMessage(
    incident: Incident,
    analysis: IncidentAnalysis,
    monitor: MonitorConfig
  ): string {
    const sections: string[] = [];

    // Header with severity indicator
    const severityEmoji = this.getSeverityEmoji(incident.severity);
    sections.push(`${severityEmoji} INCIDENT DETECTED: ${monitor.name}`);
    sections.push(
      `Severity: ${incident.severity.toUpperCase()} | ` +
        `Confidence: ${analysis.rootCause.confidence.toUpperCase()} | ` +
        `Service: ${incident.serviceName}`
    );
    sections.push('');

    // Metric details
    sections.push('--- DETAILS ---');
    sections.push(`Metric: ${incident.metricName}`);
    sections.push(
      `Current: ${this.formatNumber(incident.metricValue)} | ` +
        `Baseline: ${this.formatNumber(incident.baselineValue)} | ` +
        `Deviation: ${this.formatPercentage(incident.deviationPercentage)}`
    );
    sections.push(`Detected: ${this.formatDate(incident.detectedAt)}`);
    sections.push('');

    // Root cause summary
    sections.push('--- ROOT CAUSE ---');
    sections.push(analysis.summary);
    sections.push('');
    sections.push(`Hypothesis: ${analysis.rootCause.hypothesis}`);
    sections.push('');

    // Evidence
    if (analysis.rootCause.evidence.length > 0) {
      sections.push('--- EVIDENCE ---');
      for (const evidence of analysis.rootCause.evidence.slice(0, 5)) {
        sections.push(`- ${evidence}`);
      }
      sections.push('');
    }

    // Suspected commit
    if (analysis.rootCause.suspectedCommit) {
      sections.push('--- SUSPECTED COMMIT ---');
      const commit = analysis.rootCause.suspectedCommit;
      sections.push(`Repository: ${commit.repository}`);
      sections.push(`SHA: ${commit.sha.substring(0, 8)}`);
      sections.push(`Reason: ${commit.reason}`);
      sections.push('');
    }

    // Recommended actions
    if (analysis.recommendedActions.length > 0) {
      sections.push('--- RECOMMENDED ACTIONS ---');
      for (const action of analysis.recommendedActions.slice(0, 3)) {
        sections.push(`${action.priority}. ${action.action}`);
        if (action.reasoning) {
          sections.push(`   Reason: ${action.reasoning}`);
        }
      }
      sections.push('');
    }

    // Additional info
    sections.push('--- ADDITIONAL INFO ---');
    sections.push(`Complexity: ${analysis.estimatedComplexity}`);
    sections.push(`Requires Human Review: ${analysis.requiresHumanReview ? 'Yes' : 'No'}`);
    if (analysis.requiresRollback) {
      sections.push('*** ROLLBACK MAY BE REQUIRED ***');
    }
    sections.push('');

    // Links
    sections.push('--- LINKS ---');
    const urls = monitor.teamsNotification.urlPatterns || {};

    if (urls.incident) {
      const incidentUrl = this.interpolateUrl(urls.incident, {
        incidentId: incident.id,
      });
      sections.push(`Incident: ${incidentUrl}`);
    }

    if (urls.datadog) {
      const datadogUrl = this.interpolateUrl(urls.datadog, {
        serviceName: incident.serviceName,
      });
      sections.push(`Datadog: ${datadogUrl}`);
    }

    if (analysis.rootCause.suspectedCommit && urls.gitlab) {
      const gitlabUrl = this.interpolateUrl(urls.gitlab, {
        repository: analysis.rootCause.suspectedCommit.repository,
        sha: analysis.rootCause.suspectedCommit.sha,
      });
      sections.push(`GitLab: ${gitlabUrl}`);
    }

    return sections.join('\n');
  }

  /**
   * Format a compact summary message
   */
  formatCompactMessage(incident: Incident, analysis: IncidentAnalysis): string {
    const severityEmoji = this.getSeverityEmoji(incident.severity);

    return [
      `${severityEmoji} ${incident.serviceName}: ${analysis.summary}`,
      `Severity: ${incident.severity} | Confidence: ${analysis.rootCause.confidence}`,
      analysis.rootCause.suspectedCommit
        ? `Suspected: ${analysis.rootCause.suspectedCommit.sha.substring(0, 8)}`
        : '',
      analysis.recommendedActions[0] ? `Action: ${analysis.recommendedActions[0].action}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Format resolution notification
   */
  formatResolutionMessage(incident: Incident): string {
    return [
      `RESOLVED: ${incident.serviceName}`,
      `Incident ID: ${incident.id}`,
      `Resolved at: ${this.formatDate(incident.resolvedAt || new Date())}`,
      `Duration: ${this.formatDuration(incident.detectedAt, incident.resolvedAt || new Date())}`,
    ].join('\n');
  }

  /**
   * Interpolate URL template with variables
   */
  private interpolateUrl(template: string, variables: Record<string, string>): string {
    let url = template;

    for (const [key, value] of Object.entries(variables)) {
      url = url.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), encodeURIComponent(value));
    }

    return url;
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'critical':
        return '[CRITICAL]';
      case 'high':
        return '[HIGH]';
      case 'medium':
        return '[MEDIUM]';
      case 'low':
        return '[LOW]';
      default:
        return '[INFO]';
    }
  }

  /**
   * Format number for display
   */
  private formatNumber(value: number): string {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(2)}K`;
    }
    return value.toFixed(2);
  }

  /**
   * Format percentage for display
   */
  private formatPercentage(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  }

  /**
   * Format duration between two dates
   */
  private formatDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 60) {
      return `${diffMinutes}m`;
    }

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    if (hours < 24) {
      return `${hours}h ${minutes}m`;
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
}
