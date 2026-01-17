# MVP Requirements Document: Agentic Incident Response Platform

**Version:** 2.0 (Updated)  
**Last Updated:** January 14, 2026  
**Status:** Requirements Clarified - Awaiting Workflow Architecture Design

---

## Document Change Log

**Version 2.0 Changes:**
- Replaced Slack with MS Teams for notifications
- Replaced Anthropic Claude with Google Gemini for LLM analysis
- Replaced PostgreSQL with MS SQL Server for data storage
- Confirmed Redis inclusion from day one
- Clarified Datadog deployment tracking as optional (Tier B approach)
- Confirmed Datadog Error Tracking is enabled
- Confirmed Sourcegraph cloud deployment is ready
- Simplified REST API authentication (API keys only, no RBAC)
- Updated GitLab integration details (GitLab.com SaaS)
- Marked web search as optional (DuckDuckGo if implemented)
- Noted workflow architecture design as pending

---

## 1. Executive Summary

### 1.1 Purpose
Build a minimum viable agentic AI system that monitors Datadog for errors and anomalies, investigates root causes by correlating with GitLab commits, MS SQL Server database state, and Sourcegraph code patterns, then provides actionable insights via MS Teams. The MVP focuses on **detection and analysis only** - no automated remediation.

### 1.2 Core Value Proposition
Reduce Mean Time To Detect (MTTD) and Mean Time To Understand (MTTU) by automatically correlating metrics anomalies with recent code changes, database state, and cross-repository code patterns, then generating investigation reports powered by Google Gemini.

### 1.3 Success Criteria
- Detect critical anomalies within 2 minutes of occurrence
- Generate root cause hypothesis within 5 minutes
- Achieve >70% accuracy in identifying the correct causative commit
- Reduce manual investigation time by 50%
- Zero false positives for critical alerts

### 1.4 Out of Scope (Post-MVP)
- Automated remediation actions
- Rollback capabilities
- Multi-environment support (dev/staging/production)
- Advanced ML-based anomaly detection
- Comprehensive UI dashboard
- Integration with ticketing systems (Jira, ServiceNow)
- Automated data retention cleanup
- Role-based access control (RBAC)
- Interactive MS Teams response handling

### 1.5 Pending Design Decisions
- **Agent Workflow Architecture** - Detailed workflow orchestration and decision points (separate design thread in progress)
- **MS Teams Channel Routing** - Context document mapping incidents to Teams channels
- **Notification URL Patterns** - Configurable URL templates for Teams messages
- **ARO Environment Details** - Cluster access, namespace, registry, networking specifics
- **Requirements Documentation Format** - Structure optimized for Claude Code generation

---

## 2. Technical Stack

### 2.1 Core Technologies
- **Language**: TypeScript 5.3+
- **Runtime**: Node.js 20 LTS
- **Package Manager**: pnpm
- **Framework**: Express.js for REST API
- **Container**: Docker with multi-stage builds
- **Deployment**: Azure Red Hat OpenShift (ARO) - details TBD

### 2.2 Dependencies
- **HTTP Client**: axios
- **Validation**: zod
- **Logging**: winston
- **Configuration**: dotenv, convict
- **Testing**: Jest, supertest
- **Linting**: ESLint, Prettier
- **OpenAPI**: swagger-ui-express, openapi-typescript
- **Database Client**: mssql (node-mssql)
- **LLM Client**: @google/generative-ai
- **Sourcegraph Client**: Custom GraphQL client with axios
- **MS Teams Client**: @microsoft/microsoft-graph-client

### 2.3 External Services
- **Datadog API**: Metrics, Events, Error Tracking APIs
- **GitLab API**: GitLab.com SaaS (https://gitlab.com)
- **LLM Provider**: Google Gemini (model configurable, likely Gemini 1.5 Pro or Flash)
- **Database**: MS SQL Server (investigation target and data storage)
- **Cache**: Redis 7+ (containerized in Azure)
- **Notifications**: MS Teams (via Microsoft Graph API)
- **Code Search**: Sourcegraph (cloud deployment)
- **Web Search**: DuckDuckGo (optional, nice-to-have)

---

## 3. System Architecture

### 3.1 Component Overview

```
┌──────────────────┐
│  Datadog API     │
│  - Metrics       │
│  - Error Tracking│
│  - Deployments*  │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Detection Service             │
│   - Polls Datadog metrics       │
│   - Identifies anomalies        │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Investigation Service         │
│   - Queries GitLab commits      │
│   - Searches Sourcegraph        │
│   - Inspects MS SQL Server      │
│   - (Optional) Web search       │
│   - Builds evidence timeline    │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Analysis Service              │
│   - Sends context to Gemini     │
│   - Generates root cause report │
│   - Assigns confidence scores   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Notification Service          │
│   - Sends MS Teams alerts       │
│   - Stores incident reports     │
└─────────────────────────────────┘

         │                    │
         ▼                    ▼
  ┌──────────────┐    ┌──────────────┐
  │  MS SQL      │    │    Redis     │
  │  Server      │    │              │
  │              │    │ - Baselines  │
  │ - Incidents  │    │ - Cache      │
  │ - Evidence   │    │              │
  │ - API keys   │    │              │
  └──────────────┘    └──────────────┘

* Deployment tracking is optional (Tier B approach)
```

**Note:** Agent workflow architecture (event-driven vs multi-agent with decision points) is pending separate design session.

### 3.2 Deployment Model
- **Single deployment environment**: Production only
- **Kubernetes Deployment**: Single pod initially, prepared for horizontal scaling
- **Storage**: MS SQL Server for operational data, Redis Deployment for caching
- **Config**: ConfigMaps for non-sensitive, Secrets for API keys
- **Networking**: Internal services via ClusterIP, external API via Route
- **ARO Specifics**: TBD (cluster, namespace, registry details to be finalized)

---

## 4. Functional Requirements

### 4.1 Detection Service

#### 4.1.1 Datadog Monitoring
**REQ-DET-001**: Poll Datadog Metrics API every 60 seconds for configured queries
**REQ-DET-002**: Support configurable metric queries via JSON configuration
**REQ-DET-003**: Detect anomalies using simple threshold-based rules (no ML)
**REQ-DET-004**: Support the following anomaly types:
- Error rate spike (>5x normal rate)
- High latency (p95 >2x baseline)
- HTTP 5xx error increase (>10% of requests)
- Service availability drop (<95%)

**REQ-DET-005**: Calculate baselines using 7-day rolling average for same time of day

**REQ-DET-006**: Query Datadog Error Tracking for stack traces when anomaly detected (Error Tracking assumed to be enabled and configured)

**REQ-DET-007**: Optionally query deployment events if Datadog deployment tracking is configured (Tier 1 strategy), gracefully fall back to Tier 2/3 if not available

#### 4.1.2 Configuration Schema
```typescript
interface DatadogMonitorConfig {
  id: string;
  name: string;
  description: string;
  query: string;                    // Datadog metrics query
  checkIntervalSeconds: number;     // Polling frequency
  threshold: {
    type: 'absolute' | 'percentage' | 'multiplier';
    critical: number;
    warning: number;
  };
  timeWindow: string;               // e.g., "5m", "15m", "1h"
  tags: string[];                   // For grouping/filtering
  enabled: boolean;
  gitlabRepositories: string[];     // Repositories to investigate
  enableDatabaseInvestigation: boolean;
  databaseContext?: {
    relevantTables: string[];
    relevantSchemas: string[];
  };
  teamsNotification: {
    channelWebhookUrl: string;      // TBD: May be determined by context document
    mentionUsers?: string[];
    urlPatterns?: {                 // TBD: Configurable URL templates
      datadog?: string;
      gitlab?: string;
      incident?: string;
    };
  };
}
```

**REQ-DET-008**: Load monitor configs from `/config/monitors.json` at startup
**REQ-DET-009**: Validate all configs against JSON schema on load
**REQ-DET-010**: Log validation errors and skip invalid configs
**REQ-DET-011**: Support at least 20 concurrent monitor configurations

**REQ-DET-012**: Create example/template monitors for typical Node.js web application scenarios (architect to provide templates)

### 4.2 Investigation Service

#### 4.2.1 Investigation Tier Strategy
**REQ-INV-001**: Implement flexible three-tier investigation strategy:

**Tier 1 (Best Case)**: Datadog deployment tracking enabled
- Query deployment events API for commit SHA
- Retrieve specific commit from GitLab
- Time: ~5 seconds
- Confidence: Very High

**Tier 2 (Good Case)**: Stack trace available from Error Tracking
- Extract file path from stack trace
- Query GitLab for commits touching that specific file in past 24 hours
- Score commits by temporal proximity and risk factors
- Time: ~15 seconds
- Confidence: High

**Tier 3 (Fallback)**: Only metric anomaly available
- Query all recent commits across configured repositories
- Score by temporal correlation + risk factors
- Time: ~30 seconds
- Confidence: Medium

**REQ-INV-002**: Auto-detect which tier to use based on available Datadog data

#### 4.2.2 GitLab Integration
**REQ-INV-003**: Integrate with GitLab.com (SaaS) at base URL `https://gitlab.com`

**REQ-INV-004**: Authenticate using personal access token with scopes:
- `api` (full API access)
- `read_repository` (repository content access)

**REQ-INV-005**: For Tier 1/2: Query specific commits by SHA or file path filter

**REQ-INV-006**: For Tier 3: Query commits in the past 24 hours when anomaly detected

**REQ-INV-007**: Scope investigation to repositories tagged in monitor config

**REQ-INV-008**: Retrieve the following for each commit:
- Commit SHA, message, author, timestamp
- Full diff (for top 3-5 commits only to manage context window)
- Associated merge request details
- CI/CD pipeline status

**REQ-INV-009**: Handle GitLab API rate limits gracefully (respect rate limit headers)

#### 4.2.3 Sourcegraph Integration
**REQ-INV-010**: Integrate with Sourcegraph cloud deployment using GraphQL API

**REQ-INV-011**: Search for error message patterns found in Datadog Error Tracking

**REQ-INV-012**: Search for cross-repository references when schema or API changes detected

**REQ-INV-013**: Execute searches with filters:
- Exclude test files (`-file:test -file:mock`)
- Search specific languages when relevant (`lang:typescript`, `lang:sql`)
- Limit to recent changes when appropriate (`after:"7 days ago"`)

**REQ-INV-014**: Return impact analysis:
- Number of affected repositories
- Estimated reference count
- Critical file paths

**REQ-INV-015**: Limit Sourcegraph results to top 10 file matches for context management

#### 4.2.4 Database Investigation
**REQ-INV-016**: Connect to MS SQL Server with read-only service account (pending DBA approval)

**REQ-INV-017**: Execute only when `enableDatabaseInvestigation: true` in monitor config

**REQ-INV-018**: Implement security controls:
- 10-second query timeout
- 100-row result limit
- PII sanitization (mask emails, phone numbers, SSNs)
- Full audit logging of all queries

**REQ-INV-019**: Perform targeted investigations based on error context:
- Schema validation (verify columns, tables exist)
- Data quality checks (find unexpected NULLs, missing FK references)
- Performance analysis (slow queries, missing indexes via DMVs)
- Recent schema changes (DDL history if available)

**REQ-INV-020**: Use `databaseContext` from monitor config to focus investigation on relevant tables/schemas

**REQ-INV-021**: Return findings with relevance score (high/medium/low)

#### 4.2.5 Web Search Integration (Optional)
**REQ-INV-022**: Optionally integrate DuckDuckGo for web search (nice-to-have, not critical)

**REQ-INV-023**: If implemented, search for:
- Error messages found in Datadog logs
- Dependency names + "known issues" if version updates detected

**REQ-INV-024**: Limit to 3 web searches per investigation if used

**REQ-INV-025**: Extract and summarize top 3 search results per query

#### 4.2.6 Correlation Logic
**REQ-INV-026**: Calculate temporal proximity score:
```typescript
score = 1 - (time_since_deployment / 24_hours)
```

**REQ-INV-027**: Calculate risk score based on:
- Number of files changed (>10 files = high risk)
- Type of files (config, database migrations = high risk)
- Commit message keywords ("fix", "hotfix", "urgent" = high risk)
- Failed CI/CD pipelines

**REQ-INV-028**: Rank commits by combined temporal + risk score

**REQ-INV-029**: Return top 3-5 suspicious commits with full diffs for context

### 4.3 Analysis Service

#### 4.3.1 LLM Integration
**REQ-ANA-001**: Use Google Gemini for analysis

**REQ-ANA-002**: Support configurable model selection (e.g., `gemini-1.5-pro`, `gemini-1.5-flash`)

**REQ-ANA-003**: Load model name from configuration file for deployment flexibility

**REQ-ANA-004**: Construct analysis prompt with:
- Anomaly description (metric, threshold, current value)
- Datadog Error Tracking context (stack traces, error messages)
- Investigation tier used and confidence level
- Timeline of recent commits with diffs (top 3-5 only)
- Database investigation findings (if available)
- Sourcegraph cross-repository impact analysis (if available)
- Web search results (if available and implemented)

**REQ-ANA-005**: Request structured JSON response:
```typescript
interface IncidentAnalysis {
  summary: string;                  // One-paragraph overview
  rootCause: {
    hypothesis: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
    suspectedCommit?: {
      sha: string;
      repository: string;
      reason: string;
    };
  };
  mechanism: string;                // Detailed explanation of how error occurs
  databaseFindings?: {
    schemaIssues: string[];
    dataIssues: string[];
    relevance: 'high' | 'medium' | 'low';
  };
  crossRepoImpact?: {
    affectedRepositories: number;
    estimatedReferences: number;
    criticalPaths: string[];
  };
  contributingFactors: string[];
  recommendedActions: Array<{
    priority: number;
    action: string;
    reasoning: string;
    estimatedImpact: string;
  }>;
  estimatedComplexity: 'low' | 'medium' | 'high';
  requiresHumanReview: boolean;
  requiresRollback?: boolean;
}
```

**REQ-ANA-006**: Verify Gemini supports structured JSON output (JSON mode or function calling)

**REQ-ANA-007**: Enforce JSON response with Zod schema validation

**REQ-ANA-008**: Implement timeout of 30 seconds for LLM responses

**REQ-ANA-009**: Retry failed LLM calls up to 2 times with exponential backoff

**REQ-ANA-010**: Fall back to basic templated analysis if LLM unavailable

**REQ-ANA-011**: Manage context window by:
- Including only top 3-5 commit diffs
- Truncating large diffs (first 250 + last 250 lines)
- Limiting Sourcegraph results to top 10 matches
- Filtering file paths by relevance (stack trace files prioritized)

#### 4.3.2 Confidence Scoring
**REQ-ANA-012**: Calculate overall confidence score (0-100):
- High confidence: Clear evidence, recent commit with high correlation, Tier 1/2 investigation
- Medium confidence: Multiple hypotheses, circumstantial evidence, Tier 3 investigation
- Low confidence: No clear cause, requires human investigation, limited data available

**REQ-ANA-013**: Boost confidence when:
- Datadog deployment tracking provided exact commit
- Stack trace matches specific file in commit diff
- Database findings strongly correlate with error
- Sourcegraph shows isolated change with clear impact

### 4.4 Notification Service

#### 4.4.1 MS Teams Integration
**REQ-NOT-001**: Integrate with MS Teams using Microsoft Graph API

**REQ-NOT-002**: Authenticate via Azure AD App Registration with permissions:
- `ChannelMessage.Send` (send messages to channels)
- `Chat.ReadWrite` (if direct messages needed)

**REQ-NOT-003**: Send Teams message when incident detected via webhook or Graph API

**REQ-NOT-004**: Use plain text message format with URLs (no interactive buttons/cards for MVP)

**REQ-NOT-005**: Include in Teams message:
- Incident ID and timestamp
- Affected service/metric
- Current vs. baseline values
- Confidence level and investigation tier used
- Summary of root cause hypothesis
- Database findings summary (if available)
- Cross-repository impact (if available)
- Recommended actions (top 3)
- URLs configured per monitor or via TBD context document:
  - Link to full incident report (via platform API)
  - Link to Datadog (configurable URL pattern)
  - Link to GitLab commit (if identified)
  - Link to relevant database queries (if applicable)

**REQ-NOT-006**: Determine target Teams channel via:
- Monitor configuration (`teamsNotification.channelWebhookUrl`)
- OR context document mapping (TBD - separate design decision)

**REQ-NOT-007**: Support @mentions for on-call engineers if configured

**REQ-NOT-008**: Implement fire-and-forget pattern (no response handling for MVP)

#### 4.4.2 Incident Storage
**REQ-NOT-009**: Store all incidents in MS SQL Server with schema:
```sql
CREATE TABLE incidents (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  external_id NVARCHAR(255) UNIQUE NOT NULL,
  monitor_id NVARCHAR(255) NOT NULL,
  service_name NVARCHAR(255) NOT NULL,
  severity NVARCHAR(50) NOT NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'active', 
  -- 'active', 'resolved', 'false_positive'
  
  -- Investigation tier used
  investigation_tier NVARCHAR(20), -- 'tier1', 'tier2', 'tier3'
  
  -- Incident details
  metric_name NVARCHAR(255) NOT NULL,
  metric_value FLOAT,
  baseline_value FLOAT,
  threshold_value FLOAT NOT NULL,
  deviation_percentage FLOAT,
  error_message NVARCHAR(MAX),
  stack_trace NVARCHAR(MAX),
  
  -- Analysis result (JSON)
  analysis_result NVARCHAR(MAX), -- JSON string, will parse as needed
  
  -- Timestamps
  detected_at DATETIME2 NOT NULL,
  resolved_at DATETIME2,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  
  -- Metadata
  tags NVARCHAR(MAX), -- JSON array as string
  
  INDEX idx_incidents_monitor_id (monitor_id),
  INDEX idx_incidents_service_name (service_name),
  INDEX idx_incidents_status (status),
  INDEX idx_incidents_detected_at (detected_at DESC)
);

-- Trigger for updated_at
CREATE TRIGGER trg_incidents_updated_at
ON incidents
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE incidents
  SET updated_at = GETDATE()
  FROM incidents i
  INNER JOIN inserted ins ON i.id = ins.id;
END;
GO

-- Investigation evidence table
CREATE TABLE investigation_evidence (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  incident_id UNIQUEIDENTIFIER NOT NULL,
  
  -- Evidence source
  source NVARCHAR(50) NOT NULL, 
  -- 'datadog', 'gitlab', 'database', 'sourcegraph', 'web_search'
  
  -- Evidence data (JSON)
  evidence_data NVARCHAR(MAX) NOT NULL,
  
  -- Scoring
  confidence_score DECIMAL(3, 2),
  relevance_score DECIMAL(3, 2),
  
  -- Timestamp
  collected_at DATETIME2 DEFAULT GETDATE(),
  
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_evidence_incident_id (incident_id),
  INDEX idx_evidence_source (source)
);

-- API keys table
CREATE TABLE api_keys (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  key_hash NVARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash
  name NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  created_by NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
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
  total_tokens INT NOT NULL,
  
  -- Model info
  model_name NVARCHAR(255) NOT NULL,
  
  -- Timing
  request_duration_ms INT,
  
  -- Cost (estimated)
  estimated_cost_usd DECIMAL(10, 6),
  
  -- Timestamp
  created_at DATETIME2 DEFAULT GETDATE(),
  
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  INDEX idx_llm_usage_incident_id (incident_id),
  INDEX idx_llm_usage_created_at (created_at DESC)
);
```

**REQ-NOT-010**: Retain incidents for 90 days (manual cleanup for MVP, no automated retention policy)

**REQ-NOT-011**: Support incident status updates via API

**REQ-NOT-012**: Keep false positive incidents for full retention period (manual cleanup)

### 4.5 REST API

#### 4.5.1 Endpoints
**REQ-API-001**: `GET /api/v1/health` - Health check endpoint

**REQ-API-002**: `GET /api/v1/incidents` - List incidents (paginated)

**REQ-API-003**: `GET /api/v1/incidents/:id` - Get incident details

**REQ-API-004**: `PATCH /api/v1/incidents/:id` - Update incident status

**REQ-API-005**: `GET /api/v1/monitors` - List configured monitors

**REQ-API-006**: `GET /api/v1/metrics` - Get platform metrics (processed incidents, detection rate, etc.)

**REQ-API-007**: Return OpenAPI 3.0 spec at `/api/docs`

**REQ-API-008**: Implement request/response validation using Zod

**REQ-API-009**: Return consistent error format:
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

#### 4.5.2 Authentication
**REQ-API-010**: Require API key authentication via `X-API-Key` header

**REQ-API-011**: Support multiple API keys for different consumers

**REQ-API-012**: Return 401 for missing/invalid API keys

**REQ-API-013**: Use simple authentication model: valid API key = full access (no role-based access control for MVP)

**REQ-API-014**: Primary consumer is the agent itself (internal use)

**REQ-API-015**: No Azure AD integration, no OAuth, no RBAC for MVP

---

## 5. Non-Functional Requirements

### 5.1 Performance
**REQ-NFR-001**: Detect anomalies within 2 minutes of occurrence

**REQ-NFR-002**: Complete investigation + analysis within 5 minutes
- Tier 1: ~5 seconds for investigation
- Tier 2: ~15 seconds for investigation
- Tier 3: ~30 seconds for investigation
- Analysis: ~30-60 seconds for LLM response

**REQ-NFR-003**: Support monitoring 20 concurrent metrics with Redis caching to avoid API rate limits

**REQ-NFR-004**: Handle 100 API requests/minute to platform API

**REQ-NFR-005**: Cache GitLab repository metadata in Redis for 1 hour to reduce API calls

**REQ-NFR-006**: Cache Datadog baselines in Redis for 24 hours

**REQ-NFR-007**: Cache LLM responses in Redis for 1 hour (cost savings)

### 5.2 Reliability
**REQ-NFR-008**: Achieve 99% uptime for detection service

**REQ-NFR-009**: Gracefully handle external API failures (Datadog, GitLab, Gemini, MS SQL, Sourcegraph)

**REQ-NFR-010**: Continue monitoring even if analysis fails (use templated fallback)

**REQ-NFR-011**: Implement circuit breaker for LLM API (open after 5 consecutive failures)

**REQ-NFR-012**: Auto-recover from transient failures without manual intervention

**REQ-NFR-013**: Gracefully degrade when optional services unavailable:
- Web search (if implemented)
- Sourcegraph (proceed with partial evidence)
- Database investigation (proceed with code-only analysis)

**REQ-NFR-014**: Handle missing Datadog deployment tracking by falling back to Tier 2/3 strategies

### 5.3 Observability
**REQ-NFR-015**: Log all events with structured JSON logging (timestamp, level, service, message, metadata)

**REQ-NFR-016**: Emit Prometheus metrics:
- `incidents_detected_total` (counter, labels: monitor_id, severity, tier)
- `analysis_duration_seconds` (histogram, labels: monitor_id, tier)
- `api_request_duration_seconds` (histogram)
- `external_api_calls_total` (counter by service: datadog, gitlab, gemini, sourcegraph)
- `llm_token_usage_total` (counter, labels: type [input/output])
- `investigation_tier_used_total` (counter, labels: tier [tier1/tier2/tier3])

**REQ-NFR-017**: Send platform logs to stdout for collection by ARO logging

**REQ-NFR-018**: Include correlation ID in all logs for a single incident investigation

**REQ-NFR-019**: Audit log all database queries to MS SQL Server for security compliance

### 5.4 Security
**REQ-NFR-020**: Store all secrets (API keys, tokens) in Kubernetes Secrets

**REQ-NFR-021**: Never log sensitive data (API keys, PII, patient data)

**REQ-NFR-022**: Use TLS for all external API calls

**REQ-NFR-023**: Implement rate limiting on public API endpoints (100 req/min per IP)

**REQ-NFR-024**: Run containers as non-root user

**REQ-NFR-025**: Scan container images for vulnerabilities in CI pipeline

**REQ-NFR-026**: MS SQL Server read-only account with:
- SELECT permission only
- VIEW DEFINITION permission (for schema queries)
- VIEW SERVER STATE permission (for DMV queries)
- DENY on INSERT, UPDATE, DELETE, EXECUTE

**REQ-NFR-027**: Sanitize all database query results to remove PII:
- Mask email addresses: `user@example.com` → `[REDACTED_EMAIL]`
- Mask phone numbers: `555-123-4567` → `[REDACTED_PHONE]`
- Mask SSNs: `123-45-6789` → `[REDACTED_SSN]`

**REQ-NFR-028**: Azure AD authentication for MS Teams (App Registration required)

**REQ-NFR-029**: GitLab personal access token with minimal scopes (`api`, `read_repository`)

### 5.5 Maintainability
**REQ-NFR-030**: Achieve minimum 80% unit test coverage

**REQ-NFR-031**: Include integration tests for each external API

**REQ-NFR-032**: Generate TypeScript types from OpenAPI spec

**REQ-NFR-033**: Follow consistent code style (ESLint + Prettier)

**REQ-NFR-034**: Document all configuration options in README

**REQ-NFR-035**: Provide example monitor configurations for Node.js web applications

### 5.6 Scalability (Prepared for Future)
**REQ-NFR-036**: Design services to be stateless (state in MS SQL Server/Redis only)

**REQ-NFR-037**: Use connection pooling for database connections

**REQ-NFR-038**: Implement horizontal pod autoscaling configuration (not enabled initially)

---

## 6. Configuration Management

### 6.1 Configuration Files

**REQ-CFG-001**: Support configuration via three layers:
1. Default values (hardcoded)
2. Config file (`/config/default.json`)
3. Environment variables (highest priority)

**REQ-CFG-002**: Required configuration structure:
```typescript
interface PlatformConfig {
  server: {
    port: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  datadog: {
    apiKey: string;      // From secret
    appKey: string;      // From secret
    site: string;        // e.g., 'datadoghq.com'
    errorTrackingEnabled: boolean; // Assumed true
    deploymentTrackingEnabled: boolean; // Optional, auto-detect if present
  };
  gitlab: {
    url: string;         // 'https://gitlab.com'
    token: string;       // From secret (api + read_repository scopes)
    repositories: string[];  // List of repos to monitor (optional, can override per monitor)
  };
  gemini: {
    apiKey: string;      // From secret
    model: string;       // e.g., 'gemini-1.5-pro', 'gemini-1.5-flash'
    maxTokens: number;   // 4000 or model-specific limit
    temperature: number; // 0.2 for focused output
  };
  msTeams: {
    tenantId: string;    // Azure AD tenant ID
    clientId: string;    // App registration client ID
    clientSecret: string; // From secret
    defaultChannelWebhook?: string; // Optional default webhook
  };
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;    // From secret
    readOnlyInvestigation: {
      enabled: boolean;  // Pending DBA approval
      timeoutSeconds: number; // 10
      maxRows: number;   // 100
      auditLogging: boolean; // true
    };
  };
  redis: {
    host: string;
    port: number;
    password?: string;   // From secret
    ttl: {
      baseline: number;  // 86400 (24 hours)
      metrics: number;   // 300 (5 minutes)
      repoMetadata: number; // 3600 (1 hour)
      llmResponses: number; // 3600 (1 hour)
    };
  };
  sourcegraph: {
    url: string;         // Cloud instance URL
    token: string;       // From secret
    maxResults: number;  // 10
  };
  webSearch: {
    enabled: boolean;    // false (optional for MVP)
    provider: 'duckduckgo'; // If enabled
    maxSearches: number; // 3
  };
  monitoring: {
    configPath: string;  // Path to monitors.json
    hotReloadEnabled: boolean; // true
  };
}
```

**REQ-CFG-003**: Validate all configuration on startup

**REQ-CFG-004**: Fail fast if required configuration is missing

**REQ-CFG-005**: Log loaded configuration (redacting secrets) at startup

### 6.2 Monitor Configuration

**REQ-CFG-006**: Load monitor configs from JSON file specified in `monitoring.configPath`

**REQ-CFG-007**: Support hot-reload of monitor configs via API endpoint: `POST /api/v1/monitors/reload`

**REQ-CFG-008**: Validate monitor config schema:
```json
{
  "monitors": [
    {
      "id": "api-error-rate",
      "name": "API Error Rate",
      "description": "Monitor 5xx error rate for API service",
      "enabled": true,
      "queries": {
        "metric": "sum:trace.http.request.errors{service:api,http.status_code:5*}.as_rate()",
        "errorTracking": "service:api status:error",
        "deployment": "service:api" // Optional, used if Datadog deployment tracking enabled
      },
      "checkIntervalSeconds": 60,
      "threshold": {
        "type": "percentage",
        "warning": 5,
        "critical": 10
      },
      "timeWindow": "5m",
      "tags": ["service:api", "team:platform"],
      "gitlabRepositories": ["myorg/api-service", "myorg/shared-lib"],
      "enableDatabaseInvestigation": true,
      "databaseContext": {
        "relevantTables": ["Users", "Orders", "Sessions"],
        "relevantSchemas": ["dbo"]
      },
      "teamsNotification": {
        "channelWebhookUrl": "https://outlook.office.com/webhook/...",
        "mentionUsers": ["user1@example.com"],
        "urlPatterns": {
          "datadog": "https://app.datadoghq.com/apm/service/{{serviceName}}",
          "gitlab": "https://gitlab.com/{{repository}}/commit/{{sha}}",
          "incident": "https://platform.example.com/api/v1/incidents/{{incidentId}}"
        }
      },
      "severity": "critical"
    }
  ]
}
```

**REQ-CFG-009**: Create example monitors for Node.js web application (templates to be provided by architect)

---

## 7. Data Models

### 7.1 Database Schema

See **REQ-NOT-009** for complete MS SQL Server schema including:
- `incidents` table
- `investigation_evidence` table
- `api_keys` table
- `llm_usage` table
- Triggers for `updated_at` automation

### 7.2 Redis Cache Structure

**REQ-DATA-001**: Use Redis for caching with TTL (critical for 20 concurrent monitors):

```
# Baseline caches
datadog:baseline:{monitorId}:{hourOfDay} → JSON
TTL: 24 hours (86400 seconds)

# Metric query caches
datadog:metrics:{queryHash}:{timestamp} → JSON
TTL: 5 minutes (300 seconds)

# Repository metadata
gitlab:repo:{repoId}:metadata → JSON
TTL: 1 hour (3600 seconds)

# Commit diffs
gitlab:commit:{sha}:diff → JSON
TTL: 1 hour (3600 seconds)

# LLM response cache
llm:response:{evidenceHash} → JSON
TTL: 1 hour (3600 seconds)

# Sourcegraph search results
sourcegraph:search:{queryHash} → JSON
TTL: 15 minutes (900 seconds)

# Circuit breaker state
circuit:{serviceName}:state → "open" | "half-open" | "closed"
circuit:{serviceName}:failures → INTEGER
TTL: 60 seconds
```

**REQ-DATA-002**: Implement cache key hashing for evidence bundles and search queries using SHA-256

**REQ-DATA-003**: Support cache invalidation on monitor config reload

---

## 8. Integration Specifications

### 8.1 Datadog API

**REQ-INT-001**: Use Datadog Metrics API v2 for querying

**REQ-INT-002**: Use Datadog Error Tracking API for stack traces

**REQ-INT-003**: Optionally use Datadog Events API v2 for deployment events if deployment tracking configured

**REQ-INT-004**: Implement retry logic with exponential backoff (max 3 retries)

**REQ-INT-005**: Respect Datadog rate limits (monitor rate limit headers)

**REQ-INT-006**: Cache metric baselines in Redis to reduce API calls (critical for 20 monitors)

**REQ-INT-007**: Auto-detect Datadog deployment tracking availability by attempting to query deployment events

### 8.2 GitLab API

**REQ-INT-008**: Use GitLab REST API v4 at base URL `https://gitlab.com`

**REQ-INT-009**: Authenticate with personal access token in `PRIVATE-TOKEN` header

**REQ-INT-010**: Required endpoints:
- `GET /api/v4/projects/:id/repository/commits` - List commits
- `GET /api/v4/projects/:id/repository/commits/:sha` - Get specific commit
- `GET /api/v4/projects/:id/repository/commits/:sha/diff` - Get commit diff
- `GET /api/v4/projects/:id/merge_requests` - List MRs
- `GET /api/v4/projects/:id/pipelines` - List pipelines

**REQ-INT-011**: Implement pagination for large result sets (use `per_page=100`)

**REQ-INT-012**: Handle 404 errors gracefully for missing repos/commits

**REQ-INT-013**: Cache repository metadata in Redis (1-hour TTL)

**REQ-INT-014**: Cache commit diffs in Redis (1-hour TTL)

**REQ-INT-015**: Respect GitLab rate limit headers (`RateLimit-*`)

### 8.3 Google Gemini API

**REQ-INT-016**: Use Google Generative AI SDK (`@google/generative-ai`)

**REQ-INT-017**: Authenticate with API key from configuration

**REQ-INT-018**: Support configurable model selection (load from config file)

**REQ-INT-019**: Verify model supports JSON output mode or structured responses

**REQ-INT-020**: Set temperature to 0.2 for focused, deterministic output

**REQ-INT-021**: Implement prompt template system with variable substitution

**REQ-INT-022**: Log all prompts and responses for debugging (sanitized of PII)

**REQ-INT-023**: Track token usage and costs per incident

**REQ-INT-024**: Implement caching of identical analysis requests (1-hour TTL in Redis)

**REQ-INT-025**: Handle rate limiting gracefully (respect quota limits)

**REQ-INT-026**: Implement 30-second timeout for API calls

### 8.4 MS Teams API

**REQ-INT-027**: Use Microsoft Graph API for Teams integration

**REQ-INT-028**: Authenticate using Azure AD App Registration with client credentials flow:
- Tenant ID
- Client ID
- Client Secret

**REQ-INT-029**: Required Graph API permissions:
- `ChannelMessage.Send` (application permission)

**REQ-INT-030**: Send messages via:
- Incoming webhook (simpler, per-channel configuration)
- OR Graph API `/teams/{teamId}/channels/{channelId}/messages` endpoint

**REQ-INT-031**: Format messages as plain text with URLs (no adaptive cards for MVP)

**REQ-INT-032**: Implement retry logic for failed message posts (max 3 retries)

**REQ-INT-033**: Do not implement response handling or interactive components for MVP

**REQ-INT-034**: Support configurable URL patterns in messages (templates with variable substitution)

### 8.5 Sourcegraph API

**REQ-INT-035**: Use Sourcegraph GraphQL API (not MCP server)

**REQ-INT-036**: Connect to cloud deployment (URL from configuration)

**REQ-INT-037**: Authenticate with access token in `Authorization: token {token}` header

**REQ-INT-038**: Execute search queries with GraphQL:
```graphql
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
```

**REQ-INT-039**: Limit results to top 10 file matches

**REQ-INT-040**: Cache search results in Redis (15-minute TTL)

**REQ-INT-041**: Apply search filters:
- Exclude tests: `-file:test -file:mock -file:spec`
- Language filters when relevant: `lang:typescript`, `lang:sql`
- Time filters when appropriate: `after:"7 days ago"`

**REQ-INT-042**: Extract impact metrics:
- Total match count
- Number of affected repositories
- Critical file paths (prioritize non-test files)

### 8.6 MS SQL Server Database Access

**REQ-INT-043**: Use `mssql` npm package for database connectivity

**REQ-INT-044**: Connect with read-only service account (credentials from secrets)

**REQ-INT-045**: Implement connection pooling with limits:
- Max pool size: 10
- Min pool size: 2
- Idle timeout: 30000ms

**REQ-INT-046**: Execute queries with safety controls:
- Query timeout: 10 seconds
- Result row limit: 100
- No stored procedure execution
- No DDL/DML operations

**REQ-INT-047**: Common investigation queries:
```sql
-- Schema validation
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @schemaName;

-- Find unexpected NULLs
SELECT TOP 100 * FROM @tableName WHERE @columnName IS NULL;

-- Missing indexes (DMV)
SELECT TOP 10 
  mid.statement,
  migs.avg_user_impact,
  migs.avg_total_user_cost
FROM sys.dm_db_missing_index_details mid
JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
WHERE mid.database_id = DB_ID()
ORDER BY migs.avg_total_user_cost * migs.avg_user_impact DESC;

-- Slow queries (DMV)
SELECT TOP 10 
  qs.total_elapsed_time / qs.execution_count AS avg_time_ms,
  SUBSTRING(qt.text, 1, 500) AS query_text
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
ORDER BY avg_time_ms DESC;
```

**REQ-INT-048**: Sanitize all query results for PII before storing or passing to LLM

**REQ-INT-049**: Audit log every database query:
```typescript
interface DatabaseAuditLog {
  timestamp: string;
  query: string;
  parameters: Record<string, any>;
  rowsReturned: number;
  executionTimeMs: number;
  incidentId?: string;
}
```

**REQ-INT-050**: Handle database connection failures gracefully (continue with code-only investigation)

### 8.7 Web Search (Optional)

**REQ-INT-051**: If web search enabled, use DuckDuckGo search

**REQ-INT-052**: No API key required (use HTML scraping or Instant Answer API)

**REQ-INT-053**: Limit to 3 searches per investigation

**REQ-INT-054**: Extract top 3 results per search

**REQ-INT-055**: Cache results in Redis (15-minute TTL)

**REQ-INT-056**: Gracefully handle failures (nice-to-have feature, not critical)

---

## 9. Error Handling & Resilience

### 9.1 Error Categories

**REQ-ERR-001**: Define error types:
- `ConfigurationError` - Invalid configuration
- `ExternalAPIError` - Third-party API failure (Datadog, GitLab, Gemini, Sourcegraph, MS Teams)
- `DatabaseError` - MS SQL Server connection/query failure
- `ValidationError` - Invalid data/schema
- `AnalysisError` - LLM analysis failure
- `CacheError` - Redis connection/operation failure

**REQ-ERR-002**: Each error should include:
- Error code (unique identifier)
- Human-readable message
- Original error stack trace
- Context metadata
- Incident correlation ID if applicable

### 9.2 Fallback Behavior

**REQ-ERR-003**: If Datadog deployment tracking unavailable, fall back to Tier 2 (stack trace) or Tier 3 (temporal)

**REQ-ERR-004**: If GitLab API fails, continue with partial evidence from other sources

**REQ-ERR-005**: If Sourcegraph fails, continue without cross-repo analysis

**REQ-ERR-006**: If database investigation fails, continue with code-only analysis

**REQ-ERR-007**: If Gemini fails, generate basic templated analysis with low confidence

**REQ-ERR-008**: If MS Teams notification fails, log error and store incident anyway (allow manual retry)

**REQ-ERR-009**: If Redis cache unavailable, proceed without caching (performance degradation but functional)

**REQ-ERR-010**: Never fail silently - always log errors with full context

### 9.3 Circuit Breaker Implementation

**REQ-ERR-011**: Implement circuit breaker for LLM API:
- Open after 5 consecutive failures
- Half-open after 60 seconds
- Reset on successful call

**REQ-ERR-012**: Store circuit breaker state in Redis with 60-second TTL

**REQ-ERR-013**: When circuit open, immediately use fallback templated analysis

---

## 10. Testing Requirements

### 10.1 Unit Tests

**REQ-TEST-001**: Minimum 80% code coverage

**REQ-TEST-002**: Test all configuration validation logic

**REQ-TEST-003**: Test anomaly detection algorithms with known inputs

**REQ-TEST-004**: Test investigation tier selection logic

**REQ-TEST-005**: Test commit scoring algorithm

**REQ-TEST-006**: Mock all external API calls in unit tests

**REQ-TEST-007**: Test error handling paths

**REQ-TEST-008**: Test PII sanitization functions

**REQ-TEST-009**: Test templated analysis fallback

### 10.2 Integration Tests

**REQ-TEST-010**: Test Datadog API integration with test account

**REQ-TEST-011**: Test GitLab API integration with test repository

**REQ-TEST-012**: Test MS SQL Server database operations (read-only)

**REQ-TEST-013**: Test Redis caching behavior

**REQ-TEST-014**: Test Sourcegraph GraphQL API

**REQ-TEST-015**: Test Gemini API with mock prompts

**REQ-TEST-016**: Test MS Teams webhook posting

**REQ-TEST-017**: Test end-to-end incident flow with mocked external APIs

### 10.3 Test Data

**REQ-TEST-018**: Include sample monitor configurations for Node.js web applications

**REQ-TEST-019**: Create fixture data for:
- Datadog metric responses
- Datadog Error Tracking responses
- Datadog deployment events
- GitLab commit data with diffs
- Gemini analysis responses
- Sourcegraph search results
- Database query results

**REQ-TEST-020**: Create test scenarios for each investigation tier:
- Tier 1: Deployment tracking available
- Tier 2: Stack trace available
- Tier 3: Only metric anomaly

---

## 11. Deployment

### 11.1 Container Image

**REQ-DEP-001**: Multi-stage Dockerfile:
1. Build stage: Compile TypeScript, run tests
2. Production stage: Minimal Node.js runtime, compiled JavaScript only

**REQ-DEP-002**: Base image: `node:20-alpine`

**REQ-DEP-003**: Image size target: <200MB

**REQ-DEP-004**: Run as non-root user (UID 1000)

**REQ-DEP-005**: Health check endpoint at `/api/v1/health`

### 11.2 Kubernetes Manifests

**REQ-DEP-006**: Provide Kubernetes YAML manifests:
- Deployment (1 replica initially)
- Service (ClusterIP)
- ConfigMap (non-sensitive config)
- Secret (API keys, tokens, passwords)
- Route (external access to API)

**REQ-DEP-007**: Resource requests/limits:
```yaml
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

**REQ-DEP-008**: Liveness probe: HTTP GET `/api/v1/health`

**REQ-DEP-009**: Readiness probe: HTTP GET `/api/v1/health`

**REQ-DEP-010**: Rolling update strategy with max unavailable: 0

**REQ-DEP-011**: Design for generic Kubernetes compatibility (ARO-specific details to be finalized later)

### 11.3 Database Setup

**REQ-DEP-012**: Provide database migration scripts (T-SQL files)

**REQ-DEP-013**: Include init script to create database and apply migrations

**REQ-DEP-014**: MS SQL Server can be external or StatefulSet (deployment choice TBD)

### 11.4 Redis Setup

**REQ-DEP-015**: Provide Redis Deployment manifest

**REQ-DEP-016**: Include persistent volume claim for Redis data (optional, can use in-memory for MVP)

**REQ-DEP-017**: Configure Redis with appropriate maxmemory policy (e.g., `allkeys-lru`)

---

## 12. Documentation

### 12.1 README

**REQ-DOC-001**: Include in README.md:
- Project overview and goals
- Architecture diagram
- Prerequisites for local development
- Installation instructions
- Configuration guide (all environment variables and config file options)
- API documentation link
- Example monitor configuration for Node.js web app
- Troubleshooting guide

**REQ-DOC-002**: Document investigation tier strategies (Tier 1, 2, 3)

**REQ-DOC-003**: Document all external service integrations and required permissions

**REQ-DOC-004**: Document MS SQL Server read-only account setup

**REQ-DOC-005**: Document Azure AD App Registration setup for MS Teams

### 12.2 API Documentation

**REQ-DOC-006**: Generate API docs from OpenAPI spec

**REQ-DOC-007**: Host API docs at `/api/docs` (Swagger UI)

**REQ-DOC-008**: Include example requests/responses for each endpoint

### 12.3 Operations Runbook

**REQ-DOC-009**: Document common operational tasks:
- How to add new monitors
- How to reload configuration
- How to check logs
- How to manually trigger investigation
- How to mark incidents as false positives
- How to rotate API keys

**REQ-DOC-010**: Document Redis cache management:
- How to clear caches
- How to monitor cache hit rates
- How to adjust TTL values

**REQ-DOC-011**: Document database investigation security:
- Read-only account permissions
- Query timeout enforcement
- PII sanitization process
- Audit log review

---

## 13. Development Workflow

### 13.1 Project Structure

**REQ-DEV-001**: Organize code structure:
```
/src
  /services
    /detection         # Datadog polling, anomaly detection
    /investigation     # GitLab, Sourcegraph, Database, Web search
    /analysis          # Gemini LLM integration
    /notification      # MS Teams integration
  /api
    /routes            # Express routes
    /controllers       # Request handlers
    /middleware        # Auth, validation, error handling
  /lib
    /datadog           # Datadog API client
    /gitlab            # GitLab API client
    /gemini            # Google Gemini client
    /sourcegraph       # Sourcegraph GraphQL client
    /database          # MS SQL Server client
    /teams             # MS Teams Graph API client
    /cache             # Redis client
  /types               # TypeScript interfaces
  /utils               # Helper functions
  /config              # Configuration loader
/tests
  /unit
  /integration
/config
  monitors.json        # Monitor definitions
  default.json         # Default configuration
/scripts
  migrate-db.sql       # Database migrations
/k8s
  deployment.yaml
  service.yaml
  configmap.yaml
  secret.yaml.example
  redis.yaml
```

**REQ-DEV-002**: Use ESLint with TypeScript rules

**REQ-DEV-003**: Use Prettier for code formatting

**REQ-DEV-004**: Use conventional commits (feat, fix, chore, etc.)

**REQ-DEV-005**: Git hooks: pre-commit (lint), pre-push (test)

### 13.2 CI/CD

**REQ-DEV-006**: GitLab CI pipeline:
1. Lint code
2. Run unit tests
3. Run integration tests
4. Build Docker image
5. Scan image for vulnerabilities
6. Push to container registry (TBD)
7. (Manual) Deploy to ARO

**REQ-DEV-007**: Run tests in pipeline with isolated database and Redis instances

---

## 14. MVP Acceptance Criteria

### 14.1 Functional Acceptance

✅ System successfully detects anomalies in Datadog metrics
✅ System auto-detects investigation tier based on available Datadog data
✅ System correlates anomalies with recent GitLab commits using appropriate tier
✅ System searches Sourcegraph for cross-repository impact
✅ System investigates MS SQL Server database when enabled (pending DBA approval)
✅ System generates root cause analysis using Google Gemini
✅ System sends MS Teams notifications with analysis results
✅ System stores incident data in MS SQL Server
✅ REST API allows querying incidents and platform status
✅ All configurations loaded from files and environment variables
✅ Redis caching reduces external API calls for 20 monitors

### 14.2 Quality Acceptance

✅ 80%+ unit test coverage
✅ All integration tests passing
✅ Docker image builds successfully
✅ Deploys to Kubernetes (generic) without errors (ARO specifics TBD)
✅ API documentation generated and accessible
✅ Logs are structured and searchable
✅ No critical security vulnerabilities in dependencies
✅ PII sanitization verified for database queries
✅ Audit logging functional for database access

### 14.3 Performance Acceptance

✅ Detects anomalies within 2 minutes
✅ Completes Tier 1 investigation within 10 seconds
✅ Completes Tier 2 investigation within 20 seconds
✅ Completes Tier 3 investigation within 35 seconds
✅ Completes full analysis within 5 minutes total
✅ Handles 20 concurrent monitors
✅ API responds within 500ms (p95)
✅ Redis cache hit rate >70% for baselines

---

## 15. Post-MVP Roadmap (Reference Only)

### Phase 2 (Not in MVP)
- Automated low-risk remediation (pod restarts, scaling)
- Multi-environment support (dev, staging, production)
- Advanced anomaly detection (ML-based)
- Web UI dashboard
- Automated data retention cleanup
- Role-based access control (RBAC)
- Interactive MS Teams responses (buttons, approvals)

### Phase 3 (Not in MVP)
- Automated rollback capabilities
- Integration with ticketing systems (Jira, ServiceNow)
- Custom remediation plugins
- Advanced workflow orchestration
- Multi-agent collaboration (Agent-to-Agent)
- Conversational investigation (Model Context Protocol)

---

## 16. Open Questions & Pending Decisions

### Critical (Blocks Implementation)

**OPEN-001**: **Agent Workflow Architecture**
- **Status**: Separate design thread in progress
- **Question**: Event-driven pipeline vs multi-agent with LLM decision points?
- **Impact**: Fundamental to how services communicate and make decisions
- **Blocker**: Yes - must be resolved before detailed implementation

### Important (Can Proceed in Parallel)

**OPEN-002**: **MS Teams Channel Routing**
- **Status**: TBD
- **Question**: How to determine target Teams channel per incident?
- **Options**: Monitor config, context document mapping, single default channel
- **Impact**: Notification targeting logic

**OPEN-003**: **Notification URL Patterns**
- **Status**: TBD
- **Question**: What URL templates to include in Teams messages?
- **Options**: Configurable per monitor, global templates, dynamic generation
- **Impact**: Message content and usefulness

**OPEN-004**: **ARO Environment Details**
- **Status**: TBD
- **Question**: Cluster access, namespace, registry, networking specifics
- **Impact**: Deployment manifests and configuration
- **Workaround**: Design for generic Kubernetes, finalize ARO details later

**OPEN-005**: **Example Monitor Templates**
- **Status**: Architect to provide
- **Question**: What monitors represent typical Node.js web application scenarios?
- **Impact**: Testing and initial configuration

**OPEN-006**: **Requirements Documentation Format**
- **Status**: TBD based on Claude Code needs
- **Question**: How to structure requirements for optimal code generation?
- **Impact**: Documentation workflow

**OPEN-007**: **MS SQL Server Read-Only Access Approval**
- **Status**: Pending DBA approval
- **Question**: Will security/DBA team approve read-only database access?
- **Impact**: Database investigation feature availability
- **Workaround**: Design feature as optional, proceed with assumption of approval

### Nice-to-Have

**OPEN-008**: **Web Search Integration Depth**
- **Status**: Optional feature
- **Question**: How much to invest in DuckDuckGo integration?
- **Impact**: Investigation completeness for external dependency issues

---

## 17. Appendix: Example Monitor Configuration

```json
{
  "monitors": [
    {
      "id": "api-5xx-errors",
      "name": "API 5xx Error Rate",
      "description": "Monitors server errors in production API",
      "enabled": true,
      "queries": {
        "metric": "sum:trace.http.request.errors{service:api,env:production,http.status_code:5*}.as_rate()",
        "errorTracking": "service:api env:production status:error",
        "deployment": "service:api env:production"
      },
      "checkIntervalSeconds": 60,
      "threshold": {
        "type": "percentage",
        "warning": 5,
        "critical": 10
      },
      "timeWindow": "5m",
      "tags": ["service:api", "team:backend"],
      "gitlabRepositories": ["myorg/api-service", "myorg/shared-lib"],
      "enableDatabaseInvestigation": true,
      "databaseContext": {
        "relevantTables": ["Users", "Orders", "Sessions"],
        "relevantSchemas": ["dbo"]
      },
      "teamsNotification": {
        "channelWebhookUrl": "https://outlook.office.com/webhook/abc123/IncomingWebhook/def456/...",
        "mentionUsers": ["oncall.backend@example.com"],
        "urlPatterns": {
          "datadog": "https://app.datadoghq.com/apm/service/api",
          "gitlab": "https://gitlab.com/{{repository}}/commit/{{sha}}",
          "incident": "https://platform.example.com/api/v1/incidents/{{incidentId}}"
        }
      },
      "severity": "critical"
    },
    {
      "id": "web-p95-latency",
      "name": "Web App P95 Latency",
      "description": "Monitors 95th percentile latency for web application",
      "enabled": true,
      "queries": {
        "metric": "avg:trace.http.request.duration.by.service.95p{service:web,env:production}",
        "errorTracking": "service:web env:production",
        "deployment": "service:web env:production"
      },
      "checkIntervalSeconds": 60,
      "threshold": {
        "type": "absolute",
        "warning": 2000,
        "critical": 5000
      },
      "timeWindow": "10m",
      "tags": ["service:web", "team:frontend"],
      "gitlabRepositories": ["myorg/web-app", "myorg/shared-components"],
      "enableDatabaseInvestigation": false,
      "teamsNotification": {
        "channelWebhookUrl": "https://outlook.office.com/webhook/xyz789/IncomingWebhook/uvw012/...",
        "mentionUsers": ["oncall.frontend@example.com"]
      },
      "severity": "high"
    },
    {
      "id": "database-connection-errors",
      "name": "Database Connection Errors",
      "description": "Monitors database connection pool exhaustion",
      "enabled": true,
      "queries": {
        "metric": "sum:database.connection.errors{env:production}.as_count()",
        "errorTracking": "service:api env:production error.type:database",
        "deployment": "service:api env:production"
      },
      "checkIntervalSeconds": 60,
      "threshold": {
        "type": "multiplier",
        "warning": 3,
        "critical": 5
      },
      "timeWindow": "5m",
      "tags": ["service:database", "team:platform"],
      "gitlabRepositories": ["myorg/api-service", "myorg/batch-jobs"],
      "enableDatabaseInvestigation": true,
      "databaseContext": {
        "relevantTables": ["*"],
        "relevantSchemas": ["dbo"]
      },
      "teamsNotification": {
        "channelWebhookUrl": "https://outlook.office.com/webhook/pqr345/IncomingWebhook/stu678/...",
        "mentionUsers": ["oncall.platform@example.com", "dba.oncall@example.com"]
      },
      "severity": "critical"
    }
  ]
}
```

---

This document provides a complete specification for building an MVP that demonstrates core value while maintaining reasonable scope for initial development. The system is designed to be extensible for future enhancements while delivering immediate value through automated incident investigation and analysis.

**Key Updates in Version 2.0:**
- MS Teams replaces Slack for notifications
- Google Gemini replaces Anthropic Claude for LLM analysis
- MS SQL Server replaces PostgreSQL for data storage
- Redis included from day one for caching (critical with 20 monitors)
- Three-tier investigation strategy formalized
- Datadog Error Tracking assumed enabled
- Sourcegraph cloud deployment confirmed
- Simplified authentication (API keys only, no RBAC)
- Web search marked as optional
- Workflow architecture noted as pending separate design