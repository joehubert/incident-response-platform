import { z } from 'zod';
import { GeminiClient } from '../../lib/clients/gemini';
import { RedisClient } from '../../lib/clients/redis';
import { DatabaseClient } from '../../lib/clients/database';
import { PromptEngine } from './PromptEngine';
import logger from '../../lib/utils/logger';
import { analysisDuration } from '../../lib/utils/metrics';
import type { Incident } from '../../lib/types/incident';
import type { EvidenceBundle } from '../../lib/types/evidence';
import type { IncidentAnalysis } from '../../lib/types/analysis';
import type { LLMUsageInput } from './types';

// Zod schema for LLM response validation
const AnalysisSchema = z.object({
  summary: z.string().min(10).max(500),
  rootCause: z.object({
    hypothesis: z.string().min(20),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence: z.array(z.string()).min(1),
    suspectedCommit: z
      .object({
        sha: z.string(),
        repository: z.string(),
        reason: z.string(),
      })
      .optional(),
  }),
  mechanism: z.string().min(20),
  databaseFindings: z
    .object({
      schemaIssues: z.array(z.string()),
      dataIssues: z.array(z.string()),
      relevance: z.enum(['high', 'medium', 'low']),
    })
    .optional(),
  crossRepoImpact: z
    .object({
      affectedRepositories: z.number(),
      estimatedReferences: z.number(),
      criticalPaths: z.array(z.string()),
    })
    .optional(),
  contributingFactors: z.array(z.string()),
  recommendedActions: z.array(
    z.object({
      priority: z.number(),
      action: z.string(),
      reasoning: z.string(),
      estimatedImpact: z.string(),
    })
  ),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  requiresHumanReview: z.boolean(),
  requiresRollback: z.boolean().optional(),
});

export class AnalysisService {
  private readonly gemini: GeminiClient;
  private readonly database: DatabaseClient;
  private readonly promptEngine: PromptEngine;

  constructor(redis: RedisClient, database: DatabaseClient) {
    this.gemini = new GeminiClient(redis);
    this.database = database;
    this.promptEngine = new PromptEngine();
  }

  /**
   * Analyze incident with evidence bundle
   */
  async analyze(incident: Incident, evidence: EvidenceBundle): Promise<IncidentAnalysis> {
    const timer = analysisDuration.startTimer({
      monitor_id: incident.monitorId,
      tier: evidence.investigationTier,
      success: 'unknown',
    });

    try {
      logger.info('Starting analysis', {
        incidentId: incident.id,
        tier: evidence.investigationTier,
        completeness: evidence.completeness,
      });

      // Build prompt from evidence
      const prompt = this.promptEngine.buildAnalysisPrompt(incident, evidence);

      // Call Gemini for analysis
      const response = await this.gemini.generateAnalysis(prompt);

      // Validate response against schema
      const validated = AnalysisSchema.parse(response.content);

      // Build final analysis object
      const analysis: IncidentAnalysis = {
        incidentId: incident.id,
        summary: validated.summary,
        rootCause: validated.rootCause,
        mechanism: validated.mechanism,
        databaseFindings: validated.databaseFindings,
        crossRepoImpact: validated.crossRepoImpact,
        contributingFactors: validated.contributingFactors,
        recommendedActions: validated.recommendedActions,
        estimatedComplexity: validated.estimatedComplexity,
        requiresHumanReview: validated.requiresHumanReview,
        requiresRollback: validated.requiresRollback,
        metadata: {
          analyzedAt: new Date(),
          modelUsed: response.modelUsed,
          tokensUsed: {
            input: response.tokenUsage.inputTokens,
            output: response.tokenUsage.outputTokens,
            total: response.tokenUsage.totalTokens,
          },
          durationMs: response.durationMs,
        },
      };

      // Store LLM usage for cost tracking
      await this.storeLLMUsage({
        incidentId: incident.id,
        inputTokens: response.tokenUsage.inputTokens,
        outputTokens: response.tokenUsage.outputTokens,
        totalTokens: response.tokenUsage.totalTokens,
        modelName: response.modelUsed,
        requestDurationMs: response.durationMs,
        estimatedCostUsd: this.gemini.calculateCost(response.tokenUsage),
      });

      timer({ success: 'true' });

      logger.info('Analysis completed', {
        incidentId: incident.id,
        confidence: analysis.rootCause.confidence,
        complexity: analysis.estimatedComplexity,
        requiresHumanReview: analysis.requiresHumanReview,
      });

      return analysis;
    } catch (error) {
      timer({ success: 'false' });
      logger.error('Analysis failed, using fallback', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return fallback template-based analysis
      return this.generateFallbackAnalysis(incident, evidence);
    }
  }

  /**
   * Generate fallback analysis without LLM
   * Used when Gemini is unavailable or returns invalid response
   */
  private generateFallbackAnalysis(
    incident: Incident,
    evidence: EvidenceBundle
  ): IncidentAnalysis {
    const topCommit = evidence.gitlabContext?.commits[0];

    const fallbackAnalysis: IncidentAnalysis = {
      incidentId: incident.id,
      summary: `Incident detected in ${incident.serviceName}: ${incident.metricName} anomaly (${incident.deviationPercentage.toFixed(1)}% deviation)`,
      rootCause: {
        hypothesis: topCommit
          ? `Recent commit ${topCommit.sha.slice(0, 8)} by ${topCommit.author.name} may be related to the incident. The commit modified ${topCommit.filesChanged.length} file(s) with message: "${topCommit.message}"`
          : 'Unable to determine root cause without LLM analysis. Manual investigation required.',
        confidence: 'low',
        evidence: [
          `Metric ${incident.metricName} exceeded threshold (current: ${incident.metricValue}, baseline: ${incident.baselineValue})`,
          evidence.gitlabContext
            ? `${evidence.gitlabContext.commits.length} recent commits found using ${evidence.gitlabContext.scoringMethod} scoring`
            : 'No GitLab commits available for analysis',
          evidence.databaseContext
            ? `Database investigation found ${evidence.databaseContext.schemaFindings.length} schema issues and ${evidence.databaseContext.dataFindings.length} data issues`
            : '',
          evidence.sourcegraphContext
            ? `Sourcegraph found ${evidence.sourcegraphContext.estimatedReferences} code references across ${evidence.sourcegraphContext.affectedRepositories} repositories`
            : '',
        ].filter(Boolean),
        suspectedCommit: topCommit
          ? {
              sha: topCommit.sha,
              repository: topCommit.repository,
              reason: 'Most recent commit with highest combined score',
            }
          : undefined,
      },
      mechanism: 'Detailed mechanism analysis requires LLM availability. Please review the evidence manually.',
      databaseFindings: evidence.databaseContext
        ? {
            schemaIssues: evidence.databaseContext.schemaFindings.map((f) => f.description),
            dataIssues: evidence.databaseContext.dataFindings.map((f) => f.description),
            relevance: evidence.databaseContext.relevance,
          }
        : undefined,
      crossRepoImpact: evidence.sourcegraphContext
        ? {
            affectedRepositories: evidence.sourcegraphContext.affectedRepositories,
            estimatedReferences: evidence.sourcegraphContext.estimatedReferences,
            criticalPaths: evidence.sourcegraphContext.criticalPaths,
          }
        : undefined,
      contributingFactors: [
        'LLM analysis unavailable - manual review recommended',
        incident.errorMessage ? `Error pattern: ${incident.errorMessage}` : '',
      ].filter(Boolean),
      recommendedActions: [
        {
          priority: 1,
          action: 'Manual investigation required',
          reasoning: 'LLM analysis unavailable for automated root cause determination',
          estimatedImpact: 'Unknown - requires human analysis',
        },
        {
          priority: 2,
          action: topCommit ? `Review commit ${topCommit.sha.slice(0, 8)}` : 'Review recent deployments',
          reasoning: 'High-scoring commit based on temporal proximity',
          estimatedImpact: 'Potential rollback candidate if causative',
        },
      ],
      estimatedComplexity: 'high',
      requiresHumanReview: true,
      requiresRollback: undefined,
      metadata: {
        analyzedAt: new Date(),
        modelUsed: 'fallback-template',
        tokensUsed: { input: 0, output: 0, total: 0 },
        durationMs: 0,
      },
    };

    logger.warn('Generated fallback analysis', {
      incidentId: incident.id,
      hasCommits: !!topCommit,
      hasDatabase: !!evidence.databaseContext,
      hasSourcegraph: !!evidence.sourcegraphContext,
    });

    return fallbackAnalysis;
  }

  /**
   * Store LLM usage for cost tracking
   */
  private async storeLLMUsage(usage: LLMUsageInput): Promise<void> {
    try {
      await this.database.storeLLMUsage(usage);
    } catch (error) {
      // Non-critical - log and continue
      logger.warn('Failed to store LLM usage', {
        incidentId: usage.incidentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get Gemini circuit breaker state
   */
  getCircuitBreakerState(): 'closed' | 'open' | 'half-open' {
    return this.gemini.getCircuitBreakerState();
  }
}
