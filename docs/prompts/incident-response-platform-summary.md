# AI-Powered Incident Response Platform
## Project Summary (Updated)

**Version:** 1.1  
**Date:** January 14, 2026  
**Status:** MVP Design Phase - Requirements Clarification Complete

---

## Executive Summary

An autonomous AI agent system for automated incident detection and root cause analysis in a microservices environment. The platform monitors Datadog for anomalies, investigates GitLab commits, analyzes MS SQL Server databases, searches code with Sourcegraph, and leverages Google Gemini LLM for intelligent analysis—all while maintaining a strict no-automated-remediation policy for the MVP.

### Key Value Proposition

- **2-minute detection** from anomaly to alert
- **5-minute analysis** from detection to actionable root cause
- **90%+ accuracy** with comprehensive multi-source investigation
- **Zero human intervention** for initial triage and analysis

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Decisions](#architecture-decisions)
3. [Core Components](#core-components)
4. [Integration Points](#integration-points)
5. [Investigation Strategy](#investigation-strategy)
6. [Technology Stack](#technology-stack)
7. [MVP Scope](#mvp-scope)
8. [Implementation Plan](#implementation-plan)
9. [Future Enhancements](#future-enhancements)

---

## System Overview

### Current Infrastructure

- **Code Repository:** GitLab.com (SaaS) - `https://gitlab.com`
- **Monitoring:** Datadog (APM, logs, metrics, Error Tracking enabled, optional deployment tracking)
- **Container Platform:** Azure Red Hat OpenShift (ARO) - details TBD
- **Database:** MS SQL Server
- **Code Intelligence:** Sourcegraph (cloud-based, full codebase coverage)

### Problem Statement

Modern incident response is too slow and requires extensive manual investigation:

1. **Detection lag:** Alerts arrive late, after user impact
2. **Investigation overhead:** Engineers spend hours correlating logs, commits, and database state
3. **Context switching:** Must jump between Datadog, GitLab, database tools, and code search
4. **Incomplete analysis:** Missing cross-repository impact or database schema issues
5. **Knowledge silos:** Junior engineers lack mental models to navigate complex systems

### Solution

An autonomous agent that:

- Continuously monitors Datadog for anomalies
- Automatically investigates across multiple data sources
- Uses AI to synthesize findings into actionable root cause analysis
- Delivers results to MS Teams before engineers even log in
- Provides comprehensive cross-repository and database context

---

## Architecture Decisions

### Decision 1: REST APIs (Not MCP or Agent-to-Agent)

**Decision:** Use traditional REST APIs for MVP ✅

**Rationale:**

- Workflow is a deterministic pipeline, not conversational
- Services know exactly what to call (no dynamic tool selection needed)
- Performance critical (direct API access faster than MCP layer)
- Simpler debugging and testing
- MCP/A2A add complexity without MVP value

**When to Reconsider:**

- **MCP (Post-MVP):** When adding conversational incident investigation or human-in-the-loop remediation
- **A2A (Future):** When adding autonomous multi-agent remediation with negotiation

### Decision 2: Sourcegraph Integration

**Decision:** Include Sourcegraph from Day 1 ✅

**Implementation:** GraphQL API directly (not MCP server)

**Rationale:**

- Already deployed (cloud-based) with full codebase coverage
- Provides cross-repository visibility GitLab cannot offer
- Essential for assessing real scope of database schema issues
- Dramatically improves LLM analysis quality (75% → 95% accuracy)

### Decision 3: Database Read-Only Access

**Decision:** Direct MS SQL Server read-only access ✅

**Status:** Security/DBA approval pending but proceeding with design

**Rationale:**

- Database schema issues are common root causes
- Need to validate columns exist, find NULLs, detect missing indexes
- Boosts accuracy from ~75% to 90%+ for database-related incidents
- Read-only with strict security controls (timeouts, row limits, PII sanitization)

### Decision 4: No Automated Remediation in MVP

**Decision:** Detection and analysis only, no auto-remediation ❌

**Rationale:**

- MVP focuses on proving investigation accuracy
- Remediation requires extensive testing and safeguards
- Allows team to build confidence in AI recommendations
- Simplifies initial implementation and risk profile

### Decision 5: Datadog Deployment Tracking

**Decision:** Optional/conditional configuration ⚠️

**Rationale:**

- Platform should auto-detect if deployment tracking is enabled
- Use Tier 1 strategy when available (direct commit SHA from Datadog)
- Gracefully fall back to Tier 2/3 when deployment tracking not configured
- Error Tracking is assumed enabled for all monitored services

### Decision 6: Notification Platform

**Decision:** MS Teams (not Slack) ✅

**Implementation:**

- Azure AD App Registration with Microsoft Graph API permissions
- Plain text messages with URLs (no interactive buttons for MVP)
- Fire-and-forget pattern (no response handling)
- Channel routing via configuration (TBD - separate context document)

### Decision 7: LLM Provider

**Decision:** Google Gemini (not Anthropic Claude) ✅

**Configuration:**

- Model selection configurable per deployment (likely Gemini 1.5 Pro or Flash)
- Different SDK (Google Generative AI)
- Need to verify structured output/JSON mode support
- Different pricing model and token tracking

### Decision 8: Primary Database

**Decision:** MS SQL Server (not PostgreSQL) ✅

**Impact:**

- Adapt all schema designs to T-SQL
- Use `mssql` npm package
- All incident/evidence storage in MS SQL Server

---

## Core Components

### 1. Detection Service

**Responsibility:** Continuous anomaly detection

**Behavior:**

- Polls Datadog every 60 seconds per configured monitor
- Calculates baselines using 7-day rolling average (cached in Redis)
- Applies threshold-based detection (absolute/percentage/multiplier)
- Emits `incident.detected` event when anomaly found

**Key Features:**

- Hot-reload configuration without restart
- Support for 20 concurrent monitors
- Baseline caching to reduce API calls
- Configurable detection windows (5m, 15m, 30m, 1h)

### 2. Investigation Service

**Responsibility:** Multi-source evidence gathering

**Behavior:**

- Receives `incident.detected` event
- Executes parallel investigations:
  - **Datadog:** Error details, stack traces, deployment events (if available), APM data
  - **GitLab.com:** Recent commits with full diffs
  - **SQL Server:** Schema validation, data quality checks, performance analysis
  - **Sourcegraph:** Cross-repo code search, impact analysis
- Scores and filters evidence
- Emits `investigation.complete` event

**Three-Tier Investigation Strategy:**

**Tier 1 (Best Case - Conditional):** Datadog deployment tracking enabled
- Datadog directly provides commit SHA that caused issue
- Time: ~5 seconds, Confidence: Very High
- **Note:** Platform auto-detects availability and falls back if not present

**Tier 2 (Good Case):** Stack trace available from Error Tracking
- Extract file path from stack trace (Error Tracking assumed enabled)
- Query only commits touching that specific file
- Time: ~15 seconds, Confidence: High

**Tier 3 (Fallback):** Only metric anomaly
- Temporal correlation with all recent commits
- Score by timing + risk factors
- Time: ~30 seconds, Confidence: Medium

### 3. Analysis Service

**Responsibility:** AI-powered root cause synthesis

**Behavior:**

- Receives evidence bundle from Investigation Service
- Constructs structured prompt with all evidence
- Calls Google Gemini with JSON schema enforcement
- Validates response with Zod
- Caches analysis in Redis (1-hour TTL)
- Emits `analysis.complete` event

**LLM Integration:**

- Model: Configurable (e.g., Gemini 1.5 Pro or Gemini 1.5 Flash)
- Temperature: 0.2 (focused, deterministic)
- Response format: Structured JSON with Zod validation
- Fallback: Templated analysis if LLM unavailable

### 4. Notification Service

**Responsibility:** Alert delivery and incident tracking

**Behavior:**

- Receives `analysis.complete` event
- Formats plain text MS Teams message with URLs
- Routes to appropriate Teams channel (via TBD configuration)
- Stores incident in MS SQL Server
- Updates incident status

**MS Teams Message Format:**

```
🚨 INCIDENT DETECTED: High API Error Rate
Severity: CRITICAL | Confidence: 95% | Service: api-service

📊 DETAILS:
Metric: 5xx errors increased from 2/min to 47/min
Detected: 2026-01-14 14:23:00 UTC

🔍 ROOT CAUSE:
Database migration removed 'email' column 3 days ago, but 127 code 
references across 15 repositories still expect it. Commit abc123 
started migration but only updated 4 files.

📋 EVIDENCE:
• Datadog: Stack trace shows null pointer in UserController.ts:145
• Database: Column 'email' missing, suggests 'EmailAddress' instead
• Sourcegraph: Found 127 references to 'user.email' across 15 repos
• GitLab: Commit abc123 (3 days ago) renamed column in migration

✅ RECOMMENDED ACTIONS:
1. Rollback migration OR update remaining 123 code references
2. Priority files: UserController.ts, ProfileService.ts, EmailSender.ts
3. Estimated complexity: HIGH (multi-repo update required)

🔗 View Full Analysis: [URL]
🔗 View Incident: [URL]
🔗 View Datadog: [URL]
```

---

## Integration Points

### Datadog

**Integration Type:** REST API + APM + Error Tracking

**Capabilities:**

- Metrics queries (time-series data, aggregations)
- Log search with filters
- APM traces with stack traces
- Error tracking with stack traces (assumed enabled)
- Deployment events (commit SHAs, timestamps) - optional/conditional

**Critical Configuration:**

If deployment tracking is enabled in Datadog:

```bash
DD_VERSION="2.3.1"
DD_GIT_COMMIT_SHA="abc123"
DD_GIT_REPOSITORY_URL="https://gitlab.com/org/repo"
```

**Note:** Platform will auto-detect and use when available, gracefully falling back when not present.

**API Endpoints:**

- `/api/v1/query` - Metrics queries
- `/api/v2/logs/events/search` - Log search
- `/api/v2/apm/traces` - Trace retrieval
- `/api/v2/events` - Deployment events (if configured)

### GitLab.com

**Integration Type:** REST API v4

**Base URL:** `https://gitlab.com`

**Authentication:** Personal access token with `api` and `read_repository` scopes

**Capabilities:**

- Commit history with filters
- Full commit diffs
- File content retrieval
- Merge request details
- Pipeline status

**Key API Calls:**

```
GET /api/v4/projects/:id/repository/commits
GET /api/v4/projects/:id/repository/commits/:sha/diff
GET /api/v4/projects/:id/repository/files/:file_path
GET /api/v4/projects/:id/merge_requests
```

**Optimization:**

- Cache repository metadata (1-hour TTL)
- Limit diff retrieval to top 3-5 commits
- Use commit file filtering for targeted investigation

### MS SQL Server

**Integration Type:** Direct database connection (mssql npm package)

**Status:** Security/DBA approval pending but proceeding with design

**Capabilities:**

- Schema validation (tables, columns, indexes, constraints)
- Data quality checks (NULL violations, missing FK references)
- Performance analysis (DMVs for slow queries, missing indexes)
- DDL history (recent schema changes)

**Security Model:**

```sql
-- Read-only service account
CREATE LOGIN [incident_agent_readonly] WITH PASSWORD = '...';
USE [YourDatabase];
CREATE USER [incident_agent_readonly] FOR LOGIN [incident_agent_readonly];

-- Grant read-only permissions
GRANT SELECT ON SCHEMA::dbo TO [incident_agent_readonly];
GRANT VIEW DEFINITION TO [incident_agent_readonly];
GRANT VIEW SERVER STATE TO [incident_agent_readonly];
GRANT SHOWPLAN TO [incident_agent_readonly];

-- Explicitly deny write operations
DENY INSERT, UPDATE, DELETE, EXECUTE TO [incident_agent_readonly];
```

**Query Safety:**

- 10-second timeout enforcement
- 100-row limit on all queries
- PII sanitization in results (mask emails, phone numbers, SSNs)
- Full audit logging
- Connection pooling with limits

**Example Investigations:**

```sql
-- Schema validation
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Users';

-- Find unexpected NULLs
SELECT TOP 100 * FROM Users WHERE Email IS NULL;

-- Missing indexes
SELECT TOP 10
    migs.avg_total_user_cost * (migs.avg_user_impact / 100.0) AS improvement_measure,
    migs.avg_user_impact,
    mid.statement AS table_name,
    mid.equality_columns,
    mid.inequality_columns,
    mid.included_columns
FROM sys.dm_db_missing_index_groups AS mig
INNER JOIN sys.dm_db_missing_index_group_stats AS migs ON mig.index_group_handle = migs.group_handle
INNER JOIN sys.dm_db_missing_index_details AS mid ON mig.index_handle = mid.index_handle
ORDER BY improvement_measure DESC;

-- Slow queries
SELECT TOP 10 
    query_stats.query_hash,
    query_stats.total_elapsed_time / query_stats.execution_count AS avg_time,
    SUBSTRING(query_text.text, 1, 500) AS query
FROM sys.dm_exec_query_stats AS query_stats
CROSS APPLY sys.dm_exec_sql_text(query_stats.sql_handle) AS query_text
ORDER BY avg_time DESC;
```

### Sourcegraph

**Integration Type:** GraphQL API (cloud-based)

**Status:** Already deployed and ready to use

**Implementation:** GraphQL API directly (not MCP server)

**Capabilities:**

- Cross-repository code search
- Symbol definitions and references
- Diff search (recent changes)
- File content retrieval
- Impact analysis (affected repos/files)

**Key Queries:**

```typescript
// Find all references to a pattern
sourcegraph.search('user.email');

// Find recent changes
sourcegraph.search('user.email type:diff after:"7 days ago"');

// Find symbol definition
sourcegraph.search('calculateDiscount type:symbol');

// Search specific language
sourcegraph.search('SELECT.*email.*FROM users lang:sql');

// Exclude tests
sourcegraph.search('user.email -file:test -file:mock');
```

**Value Add:**

- Cross-repository visibility (GitLab shows one repo, Sourcegraph shows all)
- Pattern matching (finds variations: user.email, users.email, "email")
- Historical context (when patterns were introduced)
- Scope assessment (full impact across entire codebase)
- Reference discovery (hidden dependencies)

**GraphQL API Example:**

```typescript
const query = `
  query($query: String!) {
    search(query: $query) {
      results {
        matchCount
        results {
          ... on FileMatch {
            file {
              path
              repository { name }
            }
            lineMatches {
              preview
              lineNumber
            }
          }
        }
      }
    }
  }
`;
```

### Google Gemini

**Integration Type:** REST API via Google Generative AI SDK

**Configuration:**

- Model: Configurable (likely `gemini-1.5-pro` or `gemini-1.5-flash`)
- API authentication via Google Cloud API key
- Structured output/JSON mode support (to be verified)

**API Configuration:**

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;
  
  constructor(apiKey: string, modelName: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = modelName; // e.g., 'gemini-1.5-pro'
  }
  
  async analyze(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ 
      model: this.model,
      generationConfig: {
        temperature: 0.2, // Focused, deterministic
        responseMimeType: "application/json" // Request JSON output
      }
    });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }
}
```

**Token Usage Tracking:**

```typescript
class TokenTracker {
  async trackUsage(incidentId: string, usage: TokenUsage): Promise<void> {
    await db.query(
      `INSERT INTO llm_usage (incident_id, input_tokens, output_tokens, cost_usd)
       VALUES (@incidentId, @inputTokens, @outputTokens, @cost)`,
      {
        incidentId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: this.calculateCost(usage)
      }
    );
  }
  
  private calculateCost(usage: TokenUsage): number {
    // Gemini 1.5 Pro pricing (example - verify current rates)
    // Input: ~$0.00035 per 1K tokens
    // Output: ~$0.00105 per 1K tokens
    const inputCost = (usage.inputTokens / 1000) * 0.00035;
    const outputCost = (usage.outputTokens / 1000) * 0.00105;
    return inputCost + outputCost;
  }
}
```

**Response Caching:**

```typescript
async function analyzeWithCache(evidence: EvidenceBundle): Promise<IncidentAnalysis> {
  // Hash the evidence to create cache key
  const evidenceHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');
  
  const cacheKey = `llm:response:${evidenceHash}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    logger.info('Cache hit for LLM analysis', { evidenceHash });
    return JSON.parse(cached);
  }
  
  // Call LLM
  const analysis = await geminiClient.analyze(buildPrompt(evidence));
  
  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(analysis));
  
  return analysis;
}
```

### MS Teams

**Integration Type:** Microsoft Graph API via Azure AD App Registration

**Authentication:** Azure AD OAuth 2.0

**Configuration Required:**

1. Azure AD App Registration
2. Grant Microsoft Graph API permissions:
   - `ChannelMessage.Send`
   - `Channel.ReadBasic.All`
3. Obtain tenant ID, client ID, client secret

**Message Format:**

- Plain text with URLs (no rich cards/adaptive cards for MVP)
- Fire-and-forget pattern (no response handling)
- Channel routing based on configuration (TBD - separate context document)

**Implementation:**

```typescript
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

class TeamsNotifier {
  private client: Client;
  
  constructor(tenantId: string, clientId: string, clientSecret: string) {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    
    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken(
            "https://graph.microsoft.com/.default"
          );
          return token.token;
        }
      }
    });
  }
  
  async sendIncidentNotification(
    teamId: string,
    channelId: string,
    incident: Incident,
    analysis: IncidentAnalysis
  ): Promise<void> {
    const message = this.formatMessage(incident, analysis);
    
    await this.client
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .post({
        body: {
          content: message
        }
      });
  }
  
  private formatMessage(incident: Incident, analysis: IncidentAnalysis): string {
    return `🚨 INCIDENT DETECTED: ${incident.monitorName}
Severity: ${incident.severity.toUpperCase()} | Confidence: ${analysis.rootCause.confidence} | Service: ${incident.serviceName}

📊 DETAILS:
Metric: ${incident.metricName}
Current: ${incident.currentValue} | Baseline: ${incident.baselineValue}
Detected: ${incident.detectedAt}

🔍 ROOT CAUSE:
${analysis.summary}

${analysis.rootCause.hypothesis}

📋 EVIDENCE:
${analysis.rootCause.evidence.map(e => `• ${e}`).join('\n')}

✅ RECOMMENDED ACTIONS:
${analysis.recommendedActions.map((a, i) => `${i+1}. ${a.action}`).join('\n')}

🔗 View Full Analysis: ${this.buildAnalysisUrl(incident.id)}
🔗 View Incident: ${this.buildIncidentUrl(incident.id)}
🔗 View Datadog: ${this.buildDatadogUrl(incident)}`;
  }
}
```

**URL Strategy:** TBD - configurable URL patterns based on incident type

### Web Search (Optional)

**Integration Type:** DuckDuckGo API

**Priority:** Nice-to-have (not critical for MVP)

**Rationale:** 

- Free, no API setup required
- Reduces integration complexity
- Lower priority than other integrations

**Implementation:**

```typescript
import axios from 'axios';

class DuckDuckGoSearch {
  async search(query: string, limit: number = 3): Promise<SearchResult[]> {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      }
    });
    
    return response.data.RelatedTopics
      .slice(0, limit)
      .map(topic => ({
        title: topic.Text,
        url: topic.FirstURL,
        snippet: topic.Text
      }));
  }
}
```

---

## Investigation Strategy

### Commit Scoring Algorithm

When multiple commits are candidates, score by:

```typescript
function calculateCommitScore(commit: Commit, anomalyTime: Date): CommitScore {
  // Temporal: exponential decay (half-life 12 hours)
  const hoursSince = differenceInHours(anomalyTime, commit.timestamp);
  const temporal = Math.exp(-hoursSince / 12);
  
  // Risk factors
  const risk = {
    fileCount: Math.min(commit.stats.filesChanged / 20, 1),
    hasMigration: commit.files.some(f => f.includes('migration')) ? 0.5 : 0,
    hasConfig: commit.files.some(f => f.includes('config')) ? 0.3 : 0,
    isPatch: /hotfix|urgent|fix/i.test(commit.message) ? 0.4 : 0,
    failedPipeline: commit.pipeline?.status === 'failed' ? 0.6 : 0
  };
  
  const riskScore = Math.min(Object.values(risk).reduce((a,b) => a+b, 0), 1);
  
  return {
    temporal,
    risk: riskScore,
    combined: (temporal * 0.6) + (riskScore * 0.4) // Favor recency
  };
}
```

### Context Window Management

**Problem:** LLM has limited context window

**Solution:** Intelligent filtering and truncation

1. **Filter diffs by relevance:**
   - If stack trace available: Only include files mentioned
   - Otherwise: Prioritize high-risk files (auth, database, config)

2. **Truncate large diffs:**
   - Keep first 250 lines + last 250 lines
   - Show summary: "... [2,145 lines omitted] ..."

3. **Limit commits:**
   - Maximum 3-5 commits per investigation
   - Focus on highest-scored commits

4. **Sourcegraph results:**
   - Maximum 10 file matches shown in detail
   - Aggregate counts for the rest

### LLM Prompt Structure

```typescript
const prompt = `
You are an expert Site Reliability Engineer analyzing an incident.

INCIDENT DETAILS:
Service: ${incident.serviceName}
Error: "${incident.errorMessage}"
Metric: ${incident.metricName} (current: ${current}, baseline: ${baseline})
First Seen: ${incident.detectedAt}
Severity: ${incident.severity}

DATADOG CONTEXT:
${formatDatadogContext(context)}

DATABASE INVESTIGATION:
${formatDatabaseFindings(dbContext)}

SOURCEGRAPH CODE ANALYSIS:
${formatSourcegraphFindings(sgContext)}

RECENT COMMITS:
${formatCommits(commits)}

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
      "message": "commit message",
      "reasoning": "why this commit is suspect"
    }
  },
  "mechanism": "Detailed explanation of how the error occurs",
  "databaseFindings": {
    "schemaIssues": [...],
    "dataIssues": [...],
    "relevance": "high" | "medium" | "low"
  },
  "crossRepoImpact": {
    "affectedRepositories": 15,
    "estimatedReferences": 127,
    "criticalPaths": ["path1", "path2"]
  },
  "recommendedActions": [
    {
      "priority": 1,
      "action": "Specific action",
      "reasoning": "Why this helps",
      "estimatedImpact": "Expected outcome"
    }
  ],
  "estimatedComplexity": "low" | "medium" | "high",
  "requiresRollback": boolean
}
`;
```

### Response Validation

```typescript
import { z } from 'zod';

const AnalysisSchema = z.object({
  summary: z.string().min(10).max(200),
  rootCause: z.object({
    hypothesis: z.string().min(20),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence: z.array(z.string()).min(1),
    suspectedCommit: z.object({
      sha: z.string(),
      message: z.string(),
      reasoning: z.string()
    }).optional()
  }),
  mechanism: z.string().min(20),
  databaseFindings: z.object({
    schemaIssues: z.array(z.string()),
    dataIssues: z.array(z.string()),
    relevance: z.enum(['high', 'medium', 'low'])
  }),
  crossRepoImpact: z.object({
    affectedRepositories: z.number(),
    estimatedReferences: z.number(),
    criticalPaths: z.array(z.string())
  }),
  recommendedActions: z.array(z.object({
    priority: z.number(),
    action: z.string(),
    reasoning: z.string(),
    estimatedImpact: z.string()
  })),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  requiresRollback: z.boolean()
});

// Usage
try {
  const parsed = AnalysisSchema.parse(JSON.parse(geminiResponse));
  return parsed;
} catch (error) {
  // Retry with clarified prompt or fallback to template
}
```

---

## Technology Stack

### Backend Services

- **Language:** TypeScript 5.3+
- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js 4.x
- **Package Manager:** pnpm

### Data Storage

- **Operational Database:** MS SQL Server
  - Incidents table
  - Investigation evidence table
  - API keys table
  - LLM usage tracking

- **Cache Layer:** Redis 7+
  - Baseline caches (24h TTL)
  - Metric caches (5min TTL)
  - Repository metadata (1h TTL)
  - LLM response caching (1h TTL)
  - Circuit breaker state
  - Rate limiting

### External Integrations

- **Datadog Client:** `@datadog/datadog-api-client`
- **GitLab Client:** `@gitbeaker/node`
- **SQL Server Client:** `mssql` (node-mssql)
- **Sourcegraph Client:** Custom GraphQL client with `axios`
- **LLM Client:** `@google/generative-ai`
- **MS Teams Client:** `@microsoft/microsoft-graph-client`
- **Web Search (Optional):** Custom DuckDuckGo integration

### Development & Testing

- **Testing Framework:** Jest 29+
- **API Testing:** Supertest
- **Validation:** Zod 3+
- **Logging:** Winston 3+
- **Metrics:** prom-client (Prometheus)

### Container & Orchestration

- **Container:** Docker (multi-stage builds)
- **Orchestration:** Azure Red Hat OpenShift (ARO) - details TBD
- **Base Image:** Node 20 Alpine
- **Registry:** TBD

### CI/CD

- **Pipeline:** GitLab CI/CD
- **Stages:** Lint → Test → Build → Deploy
- **Security Scanning:** Container vulnerability scanning
- **Quality Gates:** 80%+ test coverage required

---

## MVP Scope

### In Scope ✅

**Core Capabilities:**

1. Monitor 20 concurrent Datadog metrics
2. Detect anomalies within 2 minutes of occurrence
3. Complete investigation + analysis within 5 minutes
4. Support three threshold types:
   - Absolute (value exceeds X)
   - Percentage (change > X%)
   - Multiplier (value > baseline * X)
5. Integrate GitLab.com commits with full diffs
6. Inspect MS SQL Server (schema, data, performance)
7. Search Sourcegraph for cross-repo impact
8. Generate LLM-powered root cause analysis (Google Gemini)
9. Send MS Teams notifications with actionable insights
10. Store incidents in MS SQL Server with queryable REST API

**Non-Functional Requirements:**

- 99% uptime for detection service
- 80%+ unit test coverage
- Graceful handling of external API failures
- Circuit breakers for LLM API
- Caching to reduce API costs (Redis from day 1)
- Horizontal scaling ready (stateless services)
- Comprehensive audit logging
- PII sanitization in all outputs

**Metrics & Targets:**

- MTTD (Mean Time To Detect): <2 minutes
- MTTU (Mean Time To Understand): <5 minutes
- Root cause accuracy: >70% (target: 90% with all sources)
- False positive rate: <5%
- Detection coverage: 20 concurrent monitors
- API response time: <500ms (p95)

### Out of Scope ❌

**Post-MVP Features:**

1. Automated remediation
2. Multi-environment support (dev/staging/prod)
3. Advanced ML-based anomaly detection
4. Comprehensive UI dashboard
5. Jira/ServiceNow integration
6. Automated rollback capabilities
7. Predictive incident prevention
8. Custom remediation plugins
9. Incident postmortem automation
10. Training mode for new services

**Deferred Capabilities:**

- Manual runbook execution
- Human-in-the-loop workflows
- Approval workflows for actions
- Cost analysis and budgeting
- Incident trend analysis dashboard
- Alert fatigue reduction features
- Integration with PagerDuty
- Mobile app notifications
- Interactive MS Teams buttons (plain text only for MVP)
- Automated data retention/cleanup (manual only)

---

## Implementation Plan

**Note:** Timeline is flexible guideline. Small team (2-3 developers), quality over speed.

### Phase 1: Foundation (Weeks 1-2)

**Objectives:**

- Set up project structure and CI/CD
- Implement core data models
- Configure MS SQL Server and Redis
- Deploy base infrastructure to ARO (pending details)

**Deliverables:**

- Git repository with monorepo structure
- GitLab CI/CD pipeline
- MS SQL Server schema and migrations
- Redis cluster configuration
- Base Docker images
- Kubernetes deployment manifests (generic, ARO-ready)

### Phase 2: Detection Service (Weeks 3-4)

**Objectives:**

- Implement Datadog integration
- Build baseline calculation logic
- Create anomaly detection engine
- Implement hot-reload configuration

**Deliverables:**

- Detection Service with Datadog API client
- Baseline calculation with Redis caching
- Configurable threshold detection
- Monitor configuration schema (monitors.json)
- Example/template monitors for Node.js web app
- Unit tests (80%+ coverage)

### Phase 3: Investigation Service (Weeks 5-7)

**Objectives:**

- Integrate GitLab.com API
- Integrate MS SQL Server (pending approval)
- Integrate Sourcegraph GraphQL API
- Implement commit scoring algorithm
- Build evidence aggregation logic

**Deliverables:**

- GitLab client with diff retrieval
- SQL Server client with read-only access (security controls)
- Sourcegraph GraphQL client
- Commit scoring implementation
- Evidence bundle data structure
- Parallel investigation orchestration
- Three-tier investigation strategy with auto-detection

### Phase 4: Analysis Service (Weeks 8-9)

**Objectives:**

- Integrate Google Gemini API
- Build prompt engineering system
- Implement response validation
- Add caching and circuit breakers

**Deliverables:**

- Gemini SDK integration
- Prompt template system
- Zod schema validation
- Response caching in Redis
- Circuit breaker for API failures
- Token usage tracking

### Phase 5: Notification & API (Weeks 10-11)

**Objectives:**

- Build MS Teams integration (Azure AD)
- Implement REST API for incidents
- Create incident storage logic
- Build health check endpoints

**Deliverables:**

- MS Teams plain text message formatting
- Azure AD authentication for Graph API
- Notification service (fire-and-forget)
- REST API with Express
- Incident CRUD operations
- Health check and metrics endpoints
- API documentation
- Simple API key authentication

### Phase 6: Testing & Refinement (Weeks 12-13)

**Objectives:**

- End-to-end testing
- Performance optimization
- Security hardening
- Documentation completion

**Deliverables:**

- Integration tests
- Load testing results
- Security audit and fixes
- Operational runbooks
- Deployment documentation
- Monitoring dashboards

### Phase 7: Production Deployment (Week 14)

**Objectives:**

- Production deployment to ARO (details TBD)
- Monitoring and alerting setup
- Team training
- Go-live

**Deliverables:**

- Production deployment
- Prometheus metrics and Grafana dashboards
- Alert rules for platform health
- Team training sessions
- Production support runbook

---

## Configuration Management

### monitors.json Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "monitors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "queries", "threshold"],
        "properties": {
          "id": {
            "type": "string",
            "description": "Unique monitor identifier"
          },
          "name": {
            "type": "string",
            "description": "Human-readable monitor name"
          },
          "description": {
            "type": "string",
            "description": "Optional description"
          },
          "enabled": {
            "type": "boolean",
            "default": true
          },
          "queries": {
            "type": "object",
            "required": ["metric"],
            "properties": {
              "metric": {
                "type": "string",
                "description": "Datadog metric query"
              },
              "errorTracking": {
                "type": "string",
                "description": "Error tracking query"
              },
              "deployment": {
                "type": "string",
                "description": "Deployment events query (optional)"
              }
            }
          },
          "threshold": {
            "type": "object",
            "required": ["type"],
            "properties": {
              "type": {
                "type": "string",
                "enum": ["absolute", "percentage", "multiplier"]
              },
              "critical": {
                "type": "number",
                "description": "Critical threshold value"
              },
              "warning": {
                "type": "number",
                "description": "Warning threshold value"
              }
            }
          },
          "timeWindow": {
            "type": "string",
            "enum": ["5m", "15m", "30m", "1h"],
            "default": "5m"
          },
          "gitlabRepositories": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "GitLab repos to investigate (e.g., 'org/api-service')"
          },
          "enableDatabaseInvestigation": {
            "type": "boolean",
            "default": false
          },
          "databaseContext": {
            "type": "object",
            "properties": {
              "relevantTables": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "relevantSchemas": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          },
          "teamsChannel": {
            "type": "object",
            "description": "MS Teams channel routing (TBD - from context document)",
            "properties": {
              "teamId": {
                "type": "string"
              },
              "channelId": {
                "type": "string"
              }
            }
          },
          "severity": {
            "type": "string",
            "enum": ["critical", "high", "medium", "low"],
            "default": "high"
          }
        }
      }
    }
  }
}
```

### Example Configuration

```json
{
  "monitors": [
    {
      "id": "api-5xx-errors",
      "name": "API 5xx Error Rate",
      "description": "Monitor for elevated 5xx errors in API service",
      "enabled": true,
      "queries": {
        "metric": "sum:trace.http.request.errors{service:api,http.status_code:5*}.as_rate()",
        "errorTracking": "service:api status:error",
        "deployment": "service:api"
      },
      "threshold": {
        "type": "percentage",
        "warning": 5,
        "critical": 10
      },
      "timeWindow": "5m",
      "gitlabRepositories": ["myorg/api-service", "myorg/shared-lib"],
      "enableDatabaseInvestigation": true,
      "databaseContext": {
        "relevantTables": ["Users", "Sessions", "Orders"],
        "relevantSchemas": ["dbo"]
      },
      "teamsChannel": {
        "teamId": "team-guid-here",
        "channelId": "channel-guid-here"
      },
      "severity": "critical"
    },
    {
      "id": "db-response-time",
      "name": "Database Response Time",
      "description": "Monitor for slow database queries",
      "enabled": true,
      "queries": {
        "metric": "avg:sqlserver.query.duration{env:prod}.as_count()",
        "errorTracking": "service:database status:error"
      },
      "threshold": {
        "type": "absolute",
        "warning": 500,
        "critical": 1000
      },
      "timeWindow": "15m",
      "gitlabRepositories": ["myorg/api-service", "myorg/batch-jobs"],
      "enableDatabaseInvestigation": true,
      "databaseContext": {
        "relevantTables": ["*"]
      },
      "teamsChannel": {
        "teamId": "team-guid-here",
        "channelId": "channel-guid-here"
      },
      "severity": "high"
    }
  ]
}
```

### Hot Reload API

```bash
# Trigger configuration reload
POST /api/v1/monitors/reload
X-API-Key: <api_key>

# Response
{
  "success": true,
  "monitorsLoaded": 20,
  "errors": [],
  "reloadedAt": "2026-01-14T14:23:00Z"
}
```

---

## Data Models

### MS SQL Server Schema

```sql
-- Incidents table
CREATE TABLE incidents (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  external_id VARCHAR(255) UNIQUE NOT NULL,
  monitor_id VARCHAR(255) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  
  -- Incident details
  metric_name VARCHAR(255) NOT NULL,
  current_value DECIMAL(20, 4),
  baseline_value DECIMAL(20, 4),
  error_message NVARCHAR(MAX),
  
  -- Timestamps
  detected_at DATETIME2 NOT NULL,
  resolved_at DATETIME2,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE(),
  
  -- Analysis results (JSON)
  analysis_result NVARCHAR(MAX) CHECK (ISJSON(analysis_result) = 1),
  
  -- Metadata
  tags NVARCHAR(MAX) CHECK (ISJSON(tags) = 1) DEFAULT '[]',
  
  INDEX idx_incidents_monitor_id (monitor_id),
  INDEX idx_incidents_service_name (service_name),
  INDEX idx_incidents_status (status),
  INDEX idx_incidents_detected_at (detected_at DESC)
);

-- Trigger to update updated_at
GO
CREATE TRIGGER trg_incidents_update
ON incidents
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE incidents
  SET updated_at = GETUTCDATE()
  FROM incidents i
  INNER JOIN inserted ins ON i.id = ins.id;
END;
GO

-- Investigation evidence table
CREATE TABLE investigation_evidence (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  incident_id UNIQUEIDENTIFIER NOT NULL,
  
  -- Evidence source
  source VARCHAR(50) NOT NULL, -- 'datadog', 'gitlab', 'database', 'sourcegraph'
  
  -- Evidence data
  evidence_data NVARCHAR(MAX) NOT NULL CHECK (ISJSON(evidence_data) = 1),
  
  -- Metadata
  collected_at DATETIME2 DEFAULT GETUTCDATE(),
  confidence_score DECIMAL(3, 2),
  
  CONSTRAINT FK_evidence_incident FOREIGN KEY (incident_id) 
    REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_evidence_incident_id (incident_id),
  INDEX idx_evidence_source (source)
);

-- API keys table
CREATE TABLE api_keys (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  key_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash
  description NVARCHAR(MAX),
  created_by VARCHAR(255),
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  last_used_at DATETIME2,
  expires_at DATETIME2,
  is_active BIT DEFAULT 1,
  
  INDEX idx_api_keys_key_hash (key_hash)
);

-- LLM usage tracking table
CREATE TABLE llm_usage (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  incident_id UNIQUEIDENTIFIER,
  
  -- Token usage
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  total_tokens AS (input_tokens + output_tokens) PERSISTED,
  
  -- Model info
  model_name VARCHAR(255) NOT NULL,
  
  -- Timing
  request_duration_ms INT,
  
  -- Cost (estimated)
  estimated_cost_usd DECIMAL(10, 6),
  
  -- Timestamps
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  
  CONSTRAINT FK_llm_usage_incident FOREIGN KEY (incident_id) 
    REFERENCES incidents(id) ON DELETE SET NULL,
  INDEX idx_llm_usage_incident_id (incident_id),
  INDEX idx_llm_usage_created_at (created_at DESC)
);
```

### Redis Key Patterns

```
# Baseline caches
datadog:baseline:{monitorId}:{hourOfDay} -> JSON
TTL: 24 hours

# Metric caches
datadog:metrics:{queryHash}:{timestamp} -> JSON
TTL: 5 minutes

# Repository metadata
gitlab:repo:{repoId}:metadata -> JSON
TTL: 1 hour

# Commit caches
gitlab:commit:{sha}:diff -> JSON
TTL: 1 hour

# LLM response caches
llm:response:{evidenceHash} -> JSON
TTL: 1 hour

# Sourcegraph search results
sourcegraph:search:{queryHash} -> JSON
TTL: 15 minutes

# Circuit breaker states
circuit:{serviceName}:state -> "open" | "half-open" | "closed"
circuit:{serviceName}:failures -> INTEGER
TTL: 60 seconds
```

---

## Error Handling & Resilience

### Retry Strategy

```typescript
class RetryStrategy {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 10000,
      backoffMultiplier = 2
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
          maxDelayMs
        );
        const jitter = Math.random() * 0.3 * delay; // ±30% jitter
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
    
    throw lastError;
  }
}
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailureTime: number = 0;
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000, // 60 seconds
    private halfOpenAttempts: number = 1
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### Graceful Degradation

```typescript
class InvestigationService {
  async investigate(incident: Incident): Promise<Investigation> {
    const results: Partial<Investigation> = {
      incidentId: incident.id,
      strategy: 'partial'
    };
    
    try {
      // Critical: Datadog context (always required)
      results.datadogContext = await this.datadog.getContext(incident);
    } catch (error) {
      // Cannot proceed without Datadog data
      throw new Error('Failed to get Datadog context: ' + error.message);
    }
    
    // Optional: GitLab commits
    try {
      results.commits = await this.gitlab.getRelevantCommits(incident);
    } catch (error) {
      logger.warn('GitLab investigation failed, continuing', { error });
      results.commits = [];
      results.warnings = [...(results.warnings || []), 'GitLab unavailable'];
    }
    
    // Optional: Database investigation (pending approval)
    try {
      results.databaseContext = await this.database.investigate(incident);
    } catch (error) {
      logger.warn('Database investigation failed, continuing', { error });
      results.databaseContext = null;
      results.warnings = [...(results.warnings || []), 'Database unavailable'];
    }
    
    // Optional: Sourcegraph search
    try {
      results.sourcegraphContext = await this.sourcegraph.search(incident);
    } catch (error) {
      logger.warn('Sourcegraph investigation failed, continuing', { error });
      results.sourcegraphContext = null;
      results.warnings = [...(results.warnings || []), 'Sourcegraph unavailable'];
    }
    
    results.completeness = this.calculateCompleteness(results);
    return results as Investigation;
  }
  
  private calculateCompleteness(results: Partial<Investigation>): number {
    const sources = [
      results.datadogContext !== undefined,
      results.commits?.length > 0,
      results.databaseContext !== null,
      results.sourcegraphContext !== null
    ];
    
    return sources.filter(Boolean).length / sources.length;
  }
}
```

### LLM Fallback

```typescript
class AnalysisService {
  async analyze(evidence: EvidenceBundle): Promise<Analysis> {
    try {
      // Try LLM analysis first
      return await this.analyzeWithGemini(evidence);
    } catch (error) {
      logger.error('LLM analysis failed, using template', { error });
      
      // Fallback to templated analysis
      return this.generateTemplateAnalysis(evidence);
    }
  }
  
  private generateTemplateAnalysis(evidence: EvidenceBundle): Analysis {
    return {
      summary: `Incident detected in ${evidence.incident.serviceName}`,
      rootCause: {
        hypothesis: this.generateHypothesis(evidence),
        confidence: 'low',
        evidence: this.extractEvidence(evidence)
      },
      recommendedActions: this.generateBasicActions(evidence),
      estimatedComplexity: 'unknown',
      llmGenerated: false,
      fallbackReason: 'LLM unavailable'
    };
  }
}
```

---

## Observability

### Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'incident-response-platform',
    version: process.env.APP_VERSION
  },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'combined.log' 
    })
  ]
});

// Usage with correlation IDs
logger.info('Incident detected', {
  correlationId: incident.id,
  monitorId: incident.monitorId,
  serviceName: incident.serviceName,
  severity: incident.severity
});
```

### Prometheus Metrics

```typescript
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

const register = new Registry();

// Incidents detected
const incidentsDetected = new Counter({
  name: 'incidents_detected_total',
  help: 'Total number of incidents detected',
  labelNames: ['monitor_id', 'severity'],
  registers: [register]
});

// Analysis duration
const analysisDuration = new Histogram({
  name: 'analysis_duration_seconds',
  help: 'Duration of incident analysis',
  labelNames: ['monitor_id', 'success'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

// LLM token usage
const llmTokens = new Counter({
  name: 'llm_tokens_total',
  help: 'Total LLM tokens used',
  labelNames: ['type'], // 'input' or 'output'
  registers: [register]
});

// External API calls
const externalApiCalls = new Counter({
  name: 'external_api_calls_total',
  help: 'Total external API calls',
  labelNames: ['service', 'status'], // 'datadog', 'gitlab', etc.
  registers: [register]
});

// Active incidents
const activeIncidents = new Gauge({
  name: 'active_incidents',
  help: 'Number of currently active incidents',
  registers: [register]
});

// Circuit breaker state
const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'],
  registers: [register]
});

// Usage
incidentsDetected.inc({ monitor_id: 'api-5xx', severity: 'critical' });
analysisDuration.observe({ monitor_id: 'api-5xx', success: 'true' }, 45.3);
llmTokens.inc({ type: 'input' }, 1523);
```

### Health Checks

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    datadog: ComponentHealth;
    llm: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

app.get('/api/v1/health', async (req, res) => {
  const health: HealthStatus = {
    status: 'healthy',
    version: process.env.APP_VERSION || 'unknown',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      datadog: await checkDatadog(),
      llm: await checkGemini()
    }
  };
  
  // Determine overall status
  const checks = Object.values(health.checks);
  if (checks.some(c => c.status === 'down')) {
    health.status = checks.filter(c => c.status === 'up').length >= 2
      ? 'degraded'
      : 'unhealthy';
  }
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## Security

### API Authentication

```typescript
import crypto from 'crypto';

// Generate API key
function generateApiKey(): string {
  return 'irp_' + crypto.randomBytes(32).toString('hex');
}

// Hash API key for storage
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Middleware
async function authenticateRequest(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }
  
  const keyHash = hashApiKey(apiKey);
  const result = await db.query(
    `SELECT * FROM api_keys WHERE key_hash = @keyHash AND is_active = 1`,
    { keyHash }
  );
  
  if (!result.recordset.length) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  
  // Update last used timestamp
  await db.query(
    `UPDATE api_keys SET last_used_at = GETUTCDATE() WHERE key_hash = @keyHash`,
    { keyHash }
  );
  
  next();
}
```

**Note:** Simple authentication only - valid key = full access (no RBAC for MVP)

### PII Sanitization

```typescript
function sanitizePII(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  for (const [key, value] of Object.entries(sanitized)) {
    // Redact email addresses
    if (key.toLowerCase().includes('email') && typeof value === 'string') {
      sanitized[key] = value.replace(
        /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
        '[REDACTED_EMAIL]'
      );
    }
    
    // Redact phone numbers
    if (key.toLowerCase().includes('phone') && typeof value === 'string') {
      sanitized[key] = value.replace(
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
        '[REDACTED_PHONE]'
      );
    }
    
    // Redact SSNs
    if (key.toLowerCase().includes('ssn') && typeof value === 'string') {
      sanitized[key] = '[REDACTED_SSN]';
    }
    
    // Recursively sanitize nested objects
    if (typeof value === 'object') {
      sanitized[key] = sanitizePII(value);
    }
  }
  
  return sanitized;
}
```

### Audit Logging

```typescript
interface AuditLogEntry {
  timestamp: string;
  action: string;
  actor: string; // API key ID or user ID
  resource: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

async function auditLog(entry: AuditLogEntry): Promise<void> {
  logger.info('Audit log', {
    ...entry,
    type: 'audit'
  });
  
  // Also store in database for compliance
  await db.query(
    `INSERT INTO audit_logs (timestamp, action, actor, resource, resource_id, details, ip_address, user_agent)
     VALUES (@timestamp, @action, @actor, @resource, @resourceId, @details, @ipAddress, @userAgent)`,
    {
      timestamp: entry.timestamp,
      action: entry.action,
      actor: entry.actor,
      resource: entry.resource,
      resourceId: entry.resourceId,
      details: JSON.stringify(entry.details),
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent
    }
  );
}

// Usage
await auditLog({
  timestamp: new Date().toISOString(),
  action: 'database.query',
  actor: 'system',
  resource: 'incidents',
  resourceId: incident.id,
  details: {
    query: 'SELECT * FROM Users WHERE Email IS NULL',
    rowsReturned: 5,
    executionTimeMs: 23
  }
});
```

---

## Future Enhancements

### Phase 2: Low-Risk Remediation (Post-MVP)

**Capabilities:**

- Automated pod restarts for common failure modes
- Auto-scaling based on detected load issues
- Cache clearing for stale data problems
- Configuration rollback to last known good state
- Automated log level adjustment for debugging

**Requirements:**

- Approval workflow for remediation actions
- Dry-run mode for testing
- Rollback capability for failed remediations
- Enhanced audit logging
- Incident postmortem automation

### Phase 3: Advanced Features

**Intelligent Routing:**

- Multi-environment support (dev/staging/prod)
- Environment-specific investigation strategies
- Cross-environment correlation

**Collaboration:**

- Jira ticket creation with full context
- ServiceNow integration
- PagerDuty bi-directional sync
- Interactive MS Teams cards (post-MVP)

**ML Enhancements:**

- Advanced ML-based anomaly detection
- Predictive incident prevention
- Seasonal baseline adjustments
- Anomaly clustering

**UI Dashboard:**

- Real-time incident feed
- Historical incident browser
- Trend analysis and reporting
- Custom investigation dashboards
- Remediation action tracking

### Phase 4: Conversational Interface (MCP Integration)

**Use Case:** Human-in-the-loop investigation

**Implementation:**

```typescript
// Add MCP server for conversational access
class IncidentResponseMCPServer {
  tools = [
    {
      name: 'get_incident_details',
      description: 'Get full details of an incident',
      parameters: { incidentId: 'string' }
    },
    {
      name: 'investigate_further',
      description: 'Perform additional investigation on specific aspect',
      parameters: { 
        incidentId: 'string',
        focus: 'commits' | 'database' | 'logs' | 'metrics'
      }
    },
    {
      name: 'propose_remediation',
      description: 'Generate remediation plan for incident',
      parameters: { incidentId: 'string' }
    }
  ];
}
```

**Value:**

- Engineers can ask follow-up questions
- Drill into specific aspects of investigation
- Request alternative hypotheses
- Explore "what-if" scenarios

### Phase 5: Autonomous Remediation (A2A)

**Use Case:** Multi-agent autonomous problem resolution

**Architecture:**

```
┌─────────────────┐
│ Detection Agent │
└────────┬────────┘
         │ detects issue
         ▼
┌─────────────────┐
│Investigation    │
│Agent            │
└────────┬────────┘
         │ proposes solution
         ▼
┌─────────────────┐      ┌──────────────┐
│ Remediation     │◄────►│ Safety Agent │
│ Planning Agent  │      │ (validates)  │
└────────┬────────┘      └──────────────┘
         │ approved
         ▼
┌─────────────────┐
│ Execution Agent │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Verification    │
│ Agent           │
└─────────────────┘
```

**Safety Mechanisms:**

- Multi-agent consensus required
- Blast radius assessment
- Automated rollback on failure
- Human override capability
- Extensive testing in sandbox

---

## Comparison: Datadog Bits AI vs. Custom Platform

### What Datadog Bits AI Provides

**Strengths:**

- Deep telemetry analysis within Datadog ecosystem
- Automatic service correlation using APM
- Real-time investigation as alerts fire
- No infrastructure to maintain
- Proven at scale across thousands of organizations

**Limitations:**

- Limited GitLab forensics (shows snippets, not full commit analysis)
- No database data investigation (only schema if configured)
- No cross-repository impact analysis
- Relies on data being sent to Datadog first
- Cannot execute custom investigation logic

### What Custom Platform Adds

**Unique Value:**

1. **Deep GitLab Forensics:**
   - Commit scoring by risk factors
   - Full diff analysis
   - Temporal correlation beyond deployment tags
   - Multi-repository commit investigation

2. **Database Data Investigation:**
   - Actual data queries (not just schema)
   - NULL violation detection
   - Missing foreign key reference checks
   - Data quality analysis

3. **Sourcegraph Integration:**
   - Cross-repository code search
   - Impact analysis across entire codebase
   - Pattern matching for error references
   - Historical code change investigation

4. **Custom Logic:**
   - Tailored commit scoring algorithms
   - Organization-specific investigation patterns
   - Custom database query templates
   - Flexible evidence synthesis

**Accuracy Comparison:**

- Datadog Bits AI alone: ~70-75% accuracy
- Custom platform with all integrations: ~90-95% accuracy

**Recommended Approach:**

Use **both** in a hybrid model:

1. Let Datadog Bits AI handle ~70% of incidents (fast, already integrated)
2. Custom platform handles remaining 30% requiring deep forensics
3. Platform can also validate/enhance Bits AI findings

---

## External Service Summary

| Service | Status | Purpose | Notes |
|---------|--------|---------|-------|
| Datadog | Ready (Error Tracking enabled) | Metrics, logs, traces, deployment events | Deployment tracking optional/conditional |
| GitLab.com | Ready | Commit history, diffs, MR details | SaaS version, personal access token auth |
| MS SQL Server | Pending approval | Schema validation, data quality checks | Read-only access, security controls |
| Sourcegraph | Ready (cloud) | Cross-repo code search | GraphQL API, already deployed |
| Google Gemini | Ready | Root cause analysis | Configurable model, structured output |
| MS Teams | Ready | Notifications | Azure AD auth, plain text for MVP |
| DuckDuckGo | Optional | Web search for error patterns | Nice-to-have, not critical |
| Redis | To deploy | Caching layer | Essential from day 1 |

---

## Success Criteria

### MVP Success Metrics

**Technical Metrics:**

- MTTD < 2 minutes (95th percentile)
- MTTU < 5 minutes (95th percentile)
- Root cause accuracy > 70% (measured via engineer feedback)
- False positive rate < 5%
- System uptime > 99%
- API latency < 500ms (p95)

**Business Metrics:**

- Reduction in mean incident resolution time: Target 30%
- Reduction in on-call escalations: Target 25%
- Engineering time saved per week: Target 10 hours
- Incidents with automated first response: Target 90%

**Quality Metrics:**

- Engineer satisfaction with root cause analysis: Target 4/5
- Percentage of analyses requiring human correction: <20%
- MS Teams notification actionability score: Target 4/5

### Phase 2 Success Metrics

**Remediation Metrics:**

- Successful automated remediations: >80%
- Automated remediation safety (no rollbacks needed): >95%
- Mean time to remediation: <10 minutes
- Human approval time: <2 minutes

---

## Key Implementation Notes

### Status & Decisions

- **Timeline:** Flexible (14-week plan is guideline only)
- **Team:** Small (2-3 developers)
- **Approach:** Requirements → Claude Code generation
- **ARO Details:** TBD (cluster, namespace, registry, networking)
- **Monitor Examples:** Template monitors for Node.js web app (architect to create)
- **Teams Channel Routing:** TBD (separate context document needed)
- **Data Retention:** Manual only (no automated cleanup for MVP)
- **Workflow Architecture:** Under design in separate thread

### Open Items

**Critical:**
- Agent workflow architecture design (in progress)

**Important:**
- MS Teams channel routing context document
- Notification URL patterns
- ARO environment specifics
- MS SQL Server read-only access approval

**Nice-to-Have:**
- DuckDuckGo integration depth
- Web search feature investment level

---

## Conclusion

This AI-powered incident response platform represents a significant advancement in autonomous operations, combining multiple data sources (Datadog, GitLab.com, MS SQL Server, Sourcegraph) with Google Gemini's analytical capabilities to deliver rapid, accurate root cause analysis.

The MVP focuses on proving investigation accuracy before attempting remediation, allowing the team to build confidence in AI-generated insights. The architecture is designed for extensibility, with clear paths to conversational interfaces (MCP) and autonomous remediation (A2A) in future phases.

By providing engineers with comprehensive, AI-analyzed incident context via MS Teams notifications before they even log in, the platform has the potential to dramatically reduce MTTR and allow teams to focus on building rather than firefighting.

**Key Technology Changes from Original Docs:**
- **LLM:** Google Gemini (not Claude)
- **Notifications:** MS Teams (not Slack)
- **Database:** MS SQL Server (not PostgreSQL)
- **GitLab:** SaaS version (GitLab.com)
- **Web Search:** DuckDuckGo (optional)
- **Caching:** Redis confirmed from day 1

---

## Appendix A: Glossary

- **MTTD:** Mean Time To Detect
- **MTTR:** Mean Time To Resolution
- **MTTU:** Mean Time To Understand
- **APM:** Application Performance Monitoring
- **ARO:** Azure Red Hat OpenShift
- **MCP:** Model Context Protocol
- **A2A:** Agent-to-Agent
- **DMV:** Dynamic Management View (SQL Server)
- **RCA:** Root Cause Analysis
- **SRE:** Site Reliability Engineering

## Appendix B: References

- [Datadog API Documentation](https://docs.datadoghq.com/api/)
- [GitLab API Documentation](https://docs.gitlab.com/ee/api/)
- [Sourcegraph GraphQL API](https://docs.sourcegraph.com/api/graphql)
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Microsoft Graph API Documentation](https://learn.microsoft.com/en-us/graph/api/overview)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [OpenShift Documentation](https://docs.openshift.com/)

## Appendix C: Contact Information

**Project Lead:** [To be assigned]  
**Technical Architect:** [To be assigned]  
**Repository:** [To be created]  
**MS Teams Channel:** #incident-response-platform

---

*Document Version: 1.1*  
*Last Updated: January 14, 2026*  
*Status: Requirements Clarification Complete - Awaiting Workflow Architecture Design*