# Requirements Document 04: Analysis Service & LangGraph Workflow
## AI-Powered Incident Response Platform - Claude Code Implementation Guide

**Version:** 1.0  
**Date:** January 14, 2026  
**Purpose:** Google Gemini integration and LangGraph workflow orchestration

---

## Overview

This document provides requirements for the Analysis Service, which uses Google Gemini for root cause analysis and LangGraph for workflow orchestration following the hybrid orchestration pattern from rec-agent-arch.md.

**Dependencies:** Documents 01, 02, and 03 must be completed first.

---

## 1. Directory Structure

```
src/services/analysis/
├── AnalysisService.ts              # Main analysis orchestrator
├── PromptEngine.ts                 # Prompt template system
├── types.ts                        # Analysis-specific types
└── index.ts                        # Exports

src/lib/clients/gemini/
├── GeminiClient.ts                 # Google Gemini client
├── types.ts                        # Gemini type definitions
└── index.ts                        # Exports

src/workflows/
└── incident-response.workflow.ts   # LangGraph workflow definition

tests/unit/services/analysis/
├── AnalysisService.test.ts
└── PromptEngine.test.ts
```

---

## 2. Gemini Client

### 2.1 src/lib/clients/gemini/GeminiClient.ts (REQUIRED)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../../config';
import { AnalysisError } from '../../utils/errors';
import logger from '../../utils/logger';
import { llmTokens, externalApiCalls, externalApiDuration } from '../../utils/metrics';
import { CircuitBreaker } from '../../utils/circuit-breaker';
import { RedisClient } from '../redis';
import type { GeminiResponse, TokenUsage } from './types';

export class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;
  private readonly redis: RedisClient;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(redis: RedisClient) {
    const apiKey = config.gemini.apiKey;
    if (!apiKey) {
      throw new AnalysisError('Missing Gemini API key');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = config.gemini.model;
    this.redis = redis;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      timeout: 60000,
      name: 'gemini',
    });
  }

  /**
   * Generate analysis with structured output
   */
  async generateAnalysis(prompt: string): Promise<GeminiResponse> {
    // Check cache
    const cacheKey = this.getCacheKey(prompt);
    const cached = await this.redis.get(cacheKey, 'llm');
    if (cached) {
      logger.debug('LLM response cache hit');
      return JSON.parse(cached);
    }

    const timer = externalApiDuration.startTimer({ service: 'gemini', endpoint: 'generate' });
    const startTime = Date.now();

    try {
      const response = await this.circuitBreaker.execute(async () => {
        const model = this.genAI.getGenerativeModel({
          model: this.model,
          generationConfig: {
            temperature: config.gemini.temperature,
            maxOutputTokens: config.gemini.maxTokens,
            responseMimeType: 'application/json',
          },
        });

        logger.debug('Calling Gemini API', { model: this.model });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        return response.text();
      });

      timer();
      const duration = Date.now() - startTime;

      // Parse response
      const text = response;
      const parsed = JSON.parse(text);

      // Track token usage (estimated)
      const tokenUsage: TokenUsage = {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(text.length / 4),
        totalTokens: 0,
      };
      tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

      llmTokens.inc({ type: 'input' }, tokenUsage.inputTokens);
      llmTokens.inc({ type: 'output' }, tokenUsage.outputTokens);
      externalApiCalls.inc({ service: 'gemini', status: 'success' });

      const result: GeminiResponse = {
        content: parsed,
        tokenUsage,
        durationMs: duration,
        modelUsed: this.model,
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

      logger.info('Gemini analysis completed', {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      timer();
      externalApiCalls.inc({ service: 'gemini', status: 'error' });
      logger.error('Gemini API call failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AnalysisError('Failed to generate analysis', error);
    }
  }

  /**
   * Calculate estimated cost
   */
  calculateCost(tokenUsage: TokenUsage): number {
    // Gemini 1.5 Pro pricing (example rates - verify current)
    const inputCostPer1K = 0.00035;
    const outputCostPer1K = 0.00105;

    const inputCost = (tokenUsage.inputTokens / 1000) * inputCostPer1K;
    const outputCost = (tokenUsage.outputTokens / 1000) * outputCostPer1K;

    return inputCost + outputCost;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(prompt: string): string {
    const hash = require('crypto').createHash('sha256').update(prompt).digest('hex');
    return `llm:response:${hash}`;
  }
}
```

### 2.2 src/lib/clients/gemini/types.ts (REQUIRED)

```typescript
export interface GeminiResponse {
  content: any;
  tokenUsage: TokenUsage;
  durationMs: number;
  modelUsed: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

### 2.3 src/lib/clients/gemini/index.ts

```typescript
export { GeminiClient } from './GeminiClient';
export type * from './types';
```

---

## 3. Prompt Engine

### 3.1 src/services/analysis/PromptEngine.ts (REQUIRED)

```typescript
import logger from '../../lib/utils/logger';
import type { EvidenceBundle } from '../../lib/types/evidence';
import type { Incident } from '../../lib/types/incident';

export class PromptEngine {
  /**
   * Build analysis prompt from evidence
   */
  buildAnalysisPrompt(incident: Incident, evidence: EvidenceBundle): string {
    const prompt = `
You are an expert Site Reliability Engineer analyzing an incident.

INCIDENT DETAILS:
Service: ${incident.serviceName}
Error: "${incident.errorMessage || 'N/A'}"
Metric: ${incident.metricName} (current: ${incident.metricValue}, baseline: ${incident.baselineValue})
First Seen: ${incident.detectedAt.toISOString()}
Severity: ${incident.severity}
Investigation Tier: ${evidence.investigationTier}

${this.formatDatadogContext(evidence.datadogContext)}

${evidence.gitlabContext ? this.formatGitLabContext(evidence.gitlabContext) : ''}

${evidence.databaseContext ? this.formatDatabaseContext(evidence.databaseContext) : ''}

${evidence.sourcegraphContext ? this.formatSourcegraphContext(evidence.sourcegraphContext) : ''}

ANALYSIS REQUIREMENTS:
1. Identify the most likely root cause
2. Explain the mechanism of failure
3. Assess confidence level (high/medium/low)
4. Provide specific, actionable next steps
5. Estimate fix complexity

Respond with ONLY valid JSON matching this schema:
{
  "summary": "Brief one-sentence summary",
  "rootCause": {
    "hypothesis": "Detailed explanation",
    "confidence": "high" | "medium" | "low",
    "evidence": ["Supporting evidence 1", "Supporting evidence 2"],
    "suspectedCommit": {
      "sha": "abc123",
      "repository": "org/repo",
      "reason": "why this commit is suspect"
    }
  },
  "mechanism": "Detailed explanation of how the error occurs",
  "databaseFindings": {
    "schemaIssues": [],
    "dataIssues": [],
    "relevance": "high" | "medium" | "low"
  },
  "crossRepoImpact": {
    "affectedRepositories": 0,
    "estimatedReferences": 0,
    "criticalPaths": []
  },
  "contributingFactors": [],
  "recommendedActions": [
    {
      "priority": 1,
      "action": "Specific action",
      "reasoning": "Why this helps",
      "estimatedImpact": "Expected outcome"
    }
  ],
  "estimatedComplexity": "low" | "medium" | "high",
  "requiresHumanReview": boolean,
  "requiresRollback": boolean
}`;

    return prompt;
  }

  /**
   * Format Datadog context
   */
  private formatDatadogContext(context: any): string {
    let output = 'DATADOG CONTEXT:\n';
    
    if (context.errorDetails) {
      output += `Error Message: ${context.errorDetails.errorMessage}\n`;
      if (context.errorDetails.stackTrace) {
        output += `Stack Trace:\n${this.truncate(context.errorDetails.stackTrace, 500)}\n`;
      }
    }

    if (context.deploymentEvent) {
      output += `Deployment: ${context.deploymentEvent.commitSha} at ${context.deploymentEvent.timestamp}\n`;
    }

    return output;
  }

  /**
   * Format GitLab context
   */
  private formatGitLabContext(context: any): string {
    let output = '\nGITLAB COMMITS:\n';
    
    for (const commit of context.commits.slice(0, 3)) {
      output += `\nCommit: ${commit.sha}\n`;
      output += `Author: ${commit.author.name}\n`;
      output += `Date: ${commit.timestamp}\n`;
      output += `Message: ${commit.message}\n`;
      output += `Score: ${commit.score.combined.toFixed(2)}\n`;
      
      if (commit.diff) {
        output += `Diff (truncated):\n${this.truncate(commit.diff, 500)}\n`;
      }
    }

    return output;
  }

  /**
   * Format database context
   */
  private formatDatabaseContext(context: any): string {
    let output = '\nDATABASE FINDINGS:\n';
    
    if (context.schemaIssues.length > 0) {
      output += 'Schema Issues:\n';
      for (const issue of context.schemaIssues) {
        output += `- ${issue}\n`;
      }
    }

    if (context.dataIssues.length > 0) {
      output += 'Data Issues:\n';
      for (const issue of context.dataIssues) {
        output += `- ${issue}\n`;
      }
    }

    return output;
  }

  /**
   * Format Sourcegraph context
   */
  private formatSourcegraphContext(context: any): string {
    return `\nSOURCEGRAPH ANALYSIS:
Affected Repositories: ${context.affectedRepositories}
Estimated References: ${context.estimatedReferences}
Critical Paths: ${context.criticalPaths.join(', ')}
`;
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const half = Math.floor(maxLength / 2);
    return text.slice(0, half) + '\n... [truncated] ...\n' + text.slice(-half);
  }
}
```

---

## 4. Analysis Service

### 4.1 src/services/analysis/AnalysisService.ts (REQUIRED)

```typescript
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

// Zod schema for validation
const AnalysisSchema = z.object({
  summary: z.string().min(10).max(200),
  rootCause: z.object({
    hypothesis: z.string().min(20),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence: z.array(z.string()).min(1),
    suspectedCommit: z.object({
      sha: z.string(),
      repository: z.string(),
      reason: z.string(),
    }).optional(),
  }),
  mechanism: z.string().min(20),
  databaseFindings: z.object({
    schemaIssues: z.array(z.string()),
    dataIssues: z.array(z.string()),
    relevance: z.enum(['high', 'medium', 'low']),
  }).optional(),
  crossRepoImpact: z.object({
    affectedRepositories: z.number(),
    estimatedReferences: z.number(),
    criticalPaths: z.array(z.string()),
  }).optional(),
  contributingFactors: z.array(z.string()),
  recommendedActions: z.array(z.object({
    priority: z.number(),
    action: z.string(),
    reasoning: z.string(),
    estimatedImpact: z.string(),
  })),
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
   * Analyze incident with evidence
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

      // Build prompt
      const prompt = this.promptEngine.buildAnalysisPrompt(incident, evidence);

      // Call Gemini
      const response = await this.gemini.generateAnalysis(prompt);

      // Validate response
      const validated = AnalysisSchema.parse(response.content);

      // Build final analysis
      const analysis: IncidentAnalysis = {
        incidentId: incident.id,
        ...validated,
        metadata: {
          analyzedAt: new Date(),
          modelUsed: response.modelUsed,
          tokensUsed: response.tokenUsage,
          durationMs: response.durationMs,
        },
      };

      // Store LLM usage
      await this.database.storeLLMUsage({
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
      });

      return analysis;
    } catch (error) {
      timer({ success: 'false' });
      logger.error('Analysis failed, using fallback', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to template
      return this.generateFallbackAnalysis(incident, evidence);
    }
  }

  /**
   * Generate fallback analysis without LLM
   */
  private generateFallbackAnalysis(
    incident: Incident,
    evidence: EvidenceBundle
  ): IncidentAnalysis {
    const topCommit = evidence.gitlabContext?.commits[0];

    return {
      incidentId: incident.id,
      summary: `Incident detected in ${incident.serviceName}: ${incident.metricName} anomaly`,
      rootCause: {
        hypothesis: topCommit 
          ? `Recent commit ${topCommit.sha} may be related to the incident`
          : 'Unable to determine root cause without LLM analysis',
        confidence: 'low',
        evidence: [
          `Metric ${incident.metricName} exceeded threshold`,
          evidence.gitlabContext ? `${evidence.gitlabContext.commits.length} recent commits found` : '',
        ].filter(Boolean),
        suspectedCommit: topCommit ? {
          sha: topCommit.sha,
          repository: topCommit.repository,
          reason: 'Most recent commit with highest score',
        } : undefined,
      },
      mechanism: 'Analysis requires LLM availability',
      contributingFactors: [],
      recommendedActions: [
        {
          priority: 1,
          action: 'Manual investigation required',
          reasoning: 'LLM analysis unavailable',
          estimatedImpact: 'Unknown',
        },
      ],
      estimatedComplexity: 'high',
      requiresHumanReview: true,
      metadata: {
        analyzedAt: new Date(),
        modelUsed: 'fallback-template',
        tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: 0,
      },
    };
  }
}
```

### 4.2 src/services/analysis/index.ts

```typescript
export { AnalysisService } from './AnalysisService';
export type * from './types';
```

---

## 5. LangGraph Workflow (Simplified for MVP)

### 5.1 src/workflows/incident-response.workflow.ts (REQUIRED)

```typescript
import { StateGraph } from '@langchain/langgraph';
import { DetectionService } from '../services/detection';
import { InvestigationService } from '../services/investigation';
import { AnalysisService } from '../services/analysis';
import { NotificationService } from '../services/notification';
import logger from '../lib/utils/logger';
import type { Incident } from '../lib/types/incident';
import type { EvidenceBundle } from '../lib/types/evidence';
import type { IncidentAnalysis } from '../lib/types/analysis';

interface WorkflowState {
  incident: Incident;
  evidence?: EvidenceBundle;
  analysis?: IncidentAnalysis;
  error?: Error;
}

export class IncidentResponseWorkflow {
  private readonly investigation: InvestigationService;
  private readonly analysis: AnalysisService;
  private readonly notification: NotificationService;
  private readonly workflow: any;

  constructor(
    investigation: InvestigationService,
    analysis: AnalysisService,
    notification: NotificationService
  ) {
    this.investigation = investigation;
    this.analysis = analysis;
    this.notification = notification;
    this.workflow = this.buildWorkflow();
  }

  /**
   * Build LangGraph workflow
   */
  private buildWorkflow() {
    const graph = new StateGraph<WorkflowState>({
      channels: {
        incident: null,
        evidence: null,
        analysis: null,
        error: null,
      },
    });

    // Add nodes
    graph.addNode('investigate', this.investigateNode.bind(this));
    graph.addNode('analyze', this.analyzeNode.bind(this));
    graph.addNode('notify', this.notifyNode.bind(this));

    // Add edges
    graph.addEdge('investigate', 'analyze');
    graph.addEdge('analyze', 'notify');
    graph.setEntryPoint('investigate');

    return graph.compile();
  }

  /**
   * Investigation node
   */
  private async investigateNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    try {
      logger.info('Executing investigation node', { incidentId: state.incident.id });
      
      // TODO: Get monitor config and datadog context
      // For now, placeholder
      const evidence = {} as EvidenceBundle;
      
      return { evidence };
    } catch (error) {
      logger.error('Investigation node failed', { error });
      return { error: error as Error };
    }
  }

  /**
   * Analysis node
   */
  private async analyzeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    try {
      logger.info('Executing analysis node', { incidentId: state.incident.id });
      
      if (!state.evidence) {
        throw new Error('No evidence available');
      }

      const analysis = await this.analysis.analyze(state.incident, state.evidence);
      
      return { analysis };
    } catch (error) {
      logger.error('Analysis node failed', { error });
      return { error: error as Error };
    }
  }

  /**
   * Notification node
   */
  private async notifyNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    try {
      logger.info('Executing notification node', { incidentId: state.incident.id });
      
      if (!state.analysis) {
        throw new Error('No analysis available');
      }

      // TODO: Send notification
      
      return {};
    } catch (error) {
      logger.error('Notification node failed', { error });
      return { error: error as Error };
    }
  }

  /**
   * Execute workflow for an incident
   */
  async execute(incident: Incident): Promise<void> {
    try {
      logger.info('Starting incident response workflow', {
        incidentId: incident.id,
      });

      await this.workflow.invoke({ incident });

      logger.info('Incident response workflow completed', {
        incidentId: incident.id,
      });
    } catch (error) {
      logger.error('Incident response workflow failed', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
```

---

## 6. Implementation Checklist

- ✅ GeminiClient with JSON output mode
- ✅ Circuit breaker for LLM calls
- ✅ Response caching in Redis
- ✅ PromptEngine with context truncation
- ✅ AnalysisService with validation
- ✅ Fallback template analysis
- ✅ LangGraph workflow (basic structure)
- ✅ Token usage tracking
- ✅ Cost calculation

---

**End of Document 04**

Next: Document 05 (Notification & API) and Document 06 (Deployment)
