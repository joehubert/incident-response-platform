import { InvestigationService } from '../services/investigation';
import { AnalysisService } from '../services/analysis';
import { RedisClient } from '../lib/clients/redis';
import { DatabaseClient } from '../lib/clients/database';
import { DatadogClient } from '../lib/clients/datadog';
import { MonitorManager } from '../services/detection';
import logger from '../lib/utils/logger';
import type { Incident, MonitorConfig } from '../lib/types/incident';
import type { EvidenceBundle } from '../lib/types/evidence';
import type { IncidentAnalysis } from '../lib/types/analysis';

/**
 * Workflow result containing analysis and evidence
 */
export interface WorkflowResult {
  analysis?: IncidentAnalysis;
  evidence?: EvidenceBundle;
  error?: Error;
  duration: number;
}

/**
 * Internal workflow state
 */
interface WorkflowState {
  incident: Incident;
  monitor?: MonitorConfig;
  evidence?: EvidenceBundle;
  analysis?: IncidentAnalysis;
  error?: Error;
}

/**
 * Incident response workflow orchestrator
 *
 * This implements the incident response pipeline with the following stages:
 * 1. fetchContext - Get monitor config and Datadog context
 * 2. investigate - Collect evidence from GitLab, Sourcegraph, Database
 * 3. analyze - Run LLM analysis on collected evidence
 *
 * The workflow is designed to be resilient to failures at each stage,
 * providing partial results when possible.
 */
export class IncidentResponseWorkflow {
  private readonly investigation: InvestigationService;
  private readonly analysis: AnalysisService;
  private readonly datadog: DatadogClient;
  private readonly monitorManager: MonitorManager;

  constructor(redis: RedisClient, database: DatabaseClient, monitorManager: MonitorManager) {
    this.datadog = new DatadogClient();
    this.investigation = new InvestigationService(redis, this.datadog);
    this.analysis = new AnalysisService(redis, database);
    this.monitorManager = monitorManager;
  }

  /**
   * Execute the complete incident response workflow
   */
  async execute(incident: Incident): Promise<WorkflowResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting incident response workflow', {
        incidentId: incident.id,
        monitorId: incident.monitorId,
        severity: incident.severity,
      });

      // Initialize state
      const state: WorkflowState = { incident };

      // Step 1: Fetch context
      await this.fetchContext(state);
      if (state.error) {
        return this.createResult(state, startTime);
      }

      // Step 2: Investigate
      await this.investigate(state);
      if (state.error) {
        return this.createResult(state, startTime);
      }

      // Step 3: Analyze
      await this.analyze(state);

      logger.info('Incident response workflow completed', {
        incidentId: incident.id,
        hasAnalysis: !!state.analysis,
        hasEvidence: !!state.evidence,
        hasError: !!state.error,
        duration: Date.now() - startTime,
      });

      return this.createResult(state, startTime);
    } catch (error) {
      logger.error('Incident response workflow failed unexpectedly', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        error: error as Error,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetch monitor configuration for the incident
   */
  private async fetchContext(state: WorkflowState): Promise<void> {
    try {
      logger.info('Fetching context for incident', { incidentId: state.incident.id });

      // Get monitor configuration
      const monitor = this.monitorManager.getMonitor(state.incident.monitorId);
      if (!monitor) {
        throw new Error(`Monitor not found: ${state.incident.monitorId}`);
      }
      state.monitor = monitor;

      logger.info('Context fetched successfully', {
        incidentId: state.incident.id,
        monitorName: monitor.name,
      });
    } catch (error) {
      logger.error('Failed to fetch context', {
        incidentId: state.incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      state.error = error as Error;
    }
  }

  /**
   * Run investigation to collect evidence
   */
  private async investigate(state: WorkflowState): Promise<void> {
    try {
      logger.info('Starting investigation', { incidentId: state.incident.id });

      if (!state.monitor) {
        throw new Error('Missing monitor configuration');
      }

      const result = await this.investigation.investigate({
        incident: state.incident,
        monitorConfig: state.monitor,
      });

      state.evidence = result.evidenceBundle;

      logger.info('Investigation completed', {
        incidentId: state.incident.id,
        tier: result.tierUsed,
        completeness: result.completeness,
        commitCount: result.evidenceBundle.gitlabContext?.commits.length || 0,
      });
    } catch (error) {
      logger.error('Investigation failed', {
        incidentId: state.incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      state.error = error as Error;
    }
  }

  /**
   * Run analysis on collected evidence
   */
  private async analyze(state: WorkflowState): Promise<void> {
    try {
      logger.info('Starting analysis', { incidentId: state.incident.id });

      if (!state.evidence) {
        throw new Error('No evidence available for analysis');
      }

      const analysis = await this.analysis.analyze(state.incident, state.evidence);
      state.analysis = analysis;

      logger.info('Analysis completed', {
        incidentId: state.incident.id,
        confidence: analysis.rootCause.confidence,
        complexity: analysis.estimatedComplexity,
        requiresHumanReview: analysis.requiresHumanReview,
      });
    } catch (error) {
      logger.error('Analysis failed', {
        incidentId: state.incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      state.error = error as Error;
    }
  }

  /**
   * Create result from state
   */
  private createResult(state: WorkflowState, startTime: number): WorkflowResult {
    return {
      analysis: state.analysis,
      evidence: state.evidence,
      error: state.error,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Get workflow status
   */
  getStatus(): { analysisCircuitBreaker: string } {
    return {
      analysisCircuitBreaker: this.analysis.getCircuitBreakerState(),
    };
  }
}
