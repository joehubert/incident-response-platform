import type {
  EvidenceBundle,
  DatadogContext,
  GitLabContext,
  DatabaseContext,
  SourcegraphContext,
} from '../../lib/types/evidence';
import type { Incident } from '../../lib/types/incident';

export class PromptEngine {
  /**
   * Build analysis prompt from evidence
   */
  buildAnalysisPrompt(incident: Incident, evidence: EvidenceBundle): string {
    const prompt = `You are an expert Site Reliability Engineer analyzing an incident.

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
   * Build investigation strategy prompt
   */
  buildInvestigationStrategyPrompt(incident: Incident): string {
    return `You are an SRE analyzing an incident to determine the best investigation strategy.

INCIDENT:
Service: ${incident.serviceName}
Error: "${incident.errorMessage || 'N/A'}"
Metric: ${incident.metricName}
Current Value: ${incident.metricValue}
Baseline Value: ${incident.baselineValue}
Deviation: ${incident.deviationPercentage}%
Severity: ${incident.severity}

Based on this incident, determine which data sources to investigate.

Respond with ONLY valid JSON:
{
  "needsGitLab": boolean,
  "needsDatabase": boolean,
  "needsSourcegraph": boolean,
  "reasoning": "Brief explanation of your strategy"
}`;
  }

  /**
   * Build evidence synthesis prompt
   */
  buildEvidenceSynthesisPrompt(evidence: EvidenceBundle): string {
    return `You are an SRE synthesizing investigation evidence.

EVIDENCE COLLECTED:
${JSON.stringify(evidence, null, 2)}

Identify the most relevant evidence and summarize findings.

Respond with ONLY valid JSON:
{
  "relevantEvidence": ["Key finding 1", "Key finding 2"],
  "likelyRootCause": "Brief hypothesis",
  "confidence": "high" | "medium" | "low",
  "additionalInvestigationNeeded": boolean,
  "recommendations": ["Action 1", "Action 2"]
}`;
  }

  /**
   * Format Datadog context for prompt
   */
  private formatDatadogContext(context: DatadogContext): string {
    let output = 'DATADOG CONTEXT:\n';

    if (context.errorDetails) {
      output += `Error Message: ${context.errorDetails.errorMessage}\n`;
      if (context.errorDetails.stackTrace) {
        output += `Stack Trace:\n${this.truncate(context.errorDetails.stackTrace, 500)}\n`;
      }
      if (context.errorDetails.filePath) {
        output += `File Path: ${context.errorDetails.filePath}`;
        if (context.errorDetails.lineNumber) {
          output += `:${context.errorDetails.lineNumber}`;
        }
        output += '\n';
      }
    }

    if (context.deploymentEvent) {
      output += `Deployment: ${context.deploymentEvent.commitSha} at ${context.deploymentEvent.timestamp.toISOString()}\n`;
      output += `Repository: ${context.deploymentEvent.repository}\n`;
    }

    if (context.metricHistory.length > 0) {
      output += `\nMetric History (last ${Math.min(5, context.metricHistory.length)} points):\n`;
      const recentPoints = context.metricHistory.slice(-5);
      for (const point of recentPoints) {
        output += `  ${point.timestamp.toISOString()}: ${point.value}\n`;
      }
    }

    return output;
  }

  /**
   * Format GitLab context for prompt
   */
  private formatGitLabContext(context: GitLabContext): string {
    let output = '\nGITLAB COMMITS:\n';
    output += `Scoring Method: ${context.scoringMethod}\n`;

    for (const commit of context.commits.slice(0, 3)) {
      output += `\nCommit: ${commit.sha}\n`;
      output += `Author: ${commit.author.name} <${commit.author.email}>\n`;
      output += `Date: ${commit.timestamp.toISOString()}\n`;
      output += `Message: ${commit.message}\n`;
      output += `Files Changed: ${commit.filesChanged.length} (+${commit.additions}/-${commit.deletions})\n`;
      output += `Score: ${commit.score.combined.toFixed(2)} (temporal: ${commit.score.temporal.toFixed(2)}, risk: ${commit.score.risk.toFixed(2)})\n`;

      if (commit.mergeRequest) {
        output += `Merge Request: ${commit.mergeRequest.title} (${commit.mergeRequest.url})\n`;
      }

      if (commit.pipeline) {
        output += `Pipeline: ${commit.pipeline.status}\n`;
      }

      if (commit.diff) {
        output += `Diff (truncated):\n${this.truncate(commit.diff, 500)}\n`;
      }
    }

    return output;
  }

  /**
   * Format database context for prompt
   */
  private formatDatabaseContext(context: DatabaseContext): string {
    let output = '\nDATABASE FINDINGS:\n';
    output += `Relevance: ${context.relevance}\n`;

    if (context.schemaFindings.length > 0) {
      output += '\nSchema Issues:\n';
      for (const finding of context.schemaFindings) {
        output += `- [${finding.type}] ${finding.description} (Table: ${finding.tableName}`;
        if (finding.columnName) {
          output += `, Column: ${finding.columnName}`;
        }
        output += ')\n';
      }
    }

    if (context.dataFindings.length > 0) {
      output += '\nData Issues:\n';
      for (const finding of context.dataFindings) {
        output += `- [${finding.type}] ${finding.description} (Table: ${finding.tableName}, Affected: ${finding.affectedRows} rows)\n`;
      }
    }

    if (context.performanceFindings.length > 0) {
      output += '\nPerformance Issues:\n';
      for (const finding of context.performanceFindings) {
        output += `- [${finding.type}] ${finding.description}\n`;
        output += `  Recommendation: ${finding.recommendation}\n`;
      }
    }

    return output;
  }

  /**
   * Format Sourcegraph context for prompt
   */
  private formatSourcegraphContext(context: SourcegraphContext): string {
    let output = '\nSOURCEGRAPH ANALYSIS:\n';
    output += `Affected Repositories: ${context.affectedRepositories}\n`;
    output += `Estimated References: ${context.estimatedReferences}\n`;

    if (context.criticalPaths.length > 0) {
      output += `Critical Paths:\n`;
      for (const path of context.criticalPaths) {
        output += `  - ${path}\n`;
      }
    }

    if (context.matches.length > 0) {
      output += `\nCode Matches (top ${Math.min(3, context.matches.length)}):\n`;
      for (const match of context.matches.slice(0, 3)) {
        output += `  ${match.repository}:${match.filePath}:${match.lineNumber}\n`;
        output += `    ${this.truncate(match.preview, 100)}\n`;
      }
    }

    return output;
  }

  /**
   * Truncate text to max length with ellipsis in middle
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const half = Math.floor(maxLength / 2);
    return text.slice(0, half) + '\n... [truncated] ...\n' + text.slice(-half);
  }
}
