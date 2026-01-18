import type { InvestigationTier } from '../../lib/types/common';
import type { Incident, MonitorConfig } from '../../lib/types/incident';
import type { TierCriteria, TierStrategy } from './types';
import logger from '../../lib/utils/logger';

/**
 * Selects the appropriate investigation tier and strategy based on incident characteristics
 *
 * Tier 1: Basic investigation (metrics only)
 * Tier 2: Enhanced investigation (metrics + GitLab commits)
 * Tier 3: Deep investigation (metrics + GitLab + database + cross-repo analysis)
 */
export class TierStrategySelector {
  /**
   * Determine the investigation tier based on incident and monitor configuration
   */
  selectTier(incident: Incident, monitorConfig: MonitorConfig): InvestigationTier {
    const criteria = this.extractCriteria(incident, monitorConfig);

    logger.debug('Evaluating tier criteria', { criteria, incidentId: incident.id });

    // Tier 3: Critical severity with stack trace and database config
    if (criteria.severity === 'critical' && criteria.hasStackTrace && criteria.hasDatabaseConfig) {
      logger.info('Selected tier3 for incident', {
        incidentId: incident.id,
        reason: 'critical with stack trace and database config',
      });
      return 'tier3';
    }

    // Tier 3: High severity with deployment event
    if (criteria.severity === 'high' && criteria.hasDeploymentEvent && criteria.hasGitLabConfig) {
      logger.info('Selected tier3 for incident', {
        incidentId: incident.id,
        reason: 'high severity with deployment event',
      });
      return 'tier3';
    }

    // Tier 2: Has stack trace or deployment event with GitLab config
    if ((criteria.hasStackTrace || criteria.hasDeploymentEvent) && criteria.hasGitLabConfig) {
      logger.info('Selected tier2 for incident', {
        incidentId: incident.id,
        reason: 'stack trace or deployment with GitLab config',
      });
      return 'tier2';
    }

    // Tier 2: High or critical severity with GitLab config
    if (
      (criteria.severity === 'high' || criteria.severity === 'critical') &&
      criteria.hasGitLabConfig
    ) {
      logger.info('Selected tier2 for incident', {
        incidentId: incident.id,
        reason: 'high/critical severity with GitLab config',
      });
      return 'tier2';
    }

    // Default to Tier 1
    logger.info('Selected tier1 for incident', { incidentId: incident.id, reason: 'default' });
    return 'tier1';
  }

  /**
   * Get the investigation strategy for a given tier
   */
  getStrategy(tier: InvestigationTier, monitorConfig: MonitorConfig): TierStrategy {
    switch (tier) {
      case 'tier1':
        return this.getTier1Strategy();
      case 'tier2':
        return this.getTier2Strategy(monitorConfig);
      case 'tier3':
        return this.getTier3Strategy(monitorConfig);
      default:
        return this.getTier1Strategy();
    }
  }

  /**
   * Extract criteria used for tier selection
   */
  private extractCriteria(incident: Incident, monitorConfig: MonitorConfig): TierCriteria {
    return {
      hasStackTrace: !!incident.stackTrace && incident.stackTrace.length > 0,
      hasDeploymentEvent: false, // Will be determined from Datadog context
      severity: incident.severity,
      hasGitLabConfig: monitorConfig.gitlabRepositories.length > 0,
      hasDatabaseConfig:
        monitorConfig.enableDatabaseInvestigation &&
        !!monitorConfig.databaseContext?.relevantTables?.length,
    };
  }

  /**
   * Tier 1: Basic metrics-only investigation
   */
  private getTier1Strategy(): TierStrategy {
    return {
      tier: 'tier1',
      collectGitLabContext: false,
      collectDatabaseContext: false,
      collectSourcegraphContext: false,
      maxCommitsToAnalyze: 0,
      includeCommitDiffs: false,
    };
  }

  /**
   * Tier 2: Enhanced investigation with GitLab context
   */
  private getTier2Strategy(monitorConfig: MonitorConfig): TierStrategy {
    return {
      tier: 'tier2',
      collectGitLabContext: monitorConfig.gitlabRepositories.length > 0,
      collectDatabaseContext: false,
      collectSourcegraphContext: false,
      maxCommitsToAnalyze: 10,
      includeCommitDiffs: true,
    };
  }

  /**
   * Tier 3: Deep investigation with all available context
   */
  private getTier3Strategy(monitorConfig: MonitorConfig): TierStrategy {
    return {
      tier: 'tier3',
      collectGitLabContext: monitorConfig.gitlabRepositories.length > 0,
      collectDatabaseContext:
        monitorConfig.enableDatabaseInvestigation &&
        !!monitorConfig.databaseContext?.relevantTables?.length,
      collectSourcegraphContext: true,
      maxCommitsToAnalyze: 20,
      includeCommitDiffs: true,
    };
  }

  /**
   * Update tier selection based on additional context (e.g., deployment event)
   */
  refineTier(
    currentTier: InvestigationTier,
    hasDeploymentEvent: boolean,
    monitorConfig: MonitorConfig
  ): InvestigationTier {
    // If we have a deployment event and are at tier1, upgrade to tier2
    if (
      currentTier === 'tier1' &&
      hasDeploymentEvent &&
      monitorConfig.gitlabRepositories.length > 0
    ) {
      logger.info('Upgrading to tier2 due to deployment event');
      return 'tier2';
    }

    // If we have a deployment event at tier2 with database config, upgrade to tier3
    if (
      currentTier === 'tier2' &&
      hasDeploymentEvent &&
      monitorConfig.enableDatabaseInvestigation
    ) {
      logger.info('Upgrading to tier3 due to deployment event with database config');
      return 'tier3';
    }

    return currentTier;
  }
}
