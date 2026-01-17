# Claude Code Implementation Guide
## AI-Powered Incident Response Platform

**Version:** 1.0  
**Last Updated:** January 16, 2026  
**Target Tool:** Claude Code  
**Project Status:** Requirements Complete - Ready for Implementation

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Implementation Strategy](#implementation-strategy)
5. [Code Generation Phases](#code-generation-phases)
6. [Key Design Patterns](#key-design-patterns)
7. [External Integrations](#external-integrations)
8. [Testing Strategy](#testing-strategy)
9. [Development Workflow](#development-workflow)
10. [Critical Implementation Notes](#critical-implementation-notes)
11. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)
12. [Success Criteria](#success-criteria)

---

## Project Overview

### Mission
Build an autonomous AI agent system that monitors Datadog for errors and anomalies, investigates root causes by correlating with GitLab commits, MS SQL Server database state, and Sourcegraph code patterns, then provides actionable insights via MS Teams.

### Core Value Proposition
- **2-minute detection** from anomaly to alert
- **5-minute analysis** from detection to root cause hypothesis
- **>70% accuracy** in identifying causative commits
- **50% reduction** in manual investigation time
- **Zero false positives** for critical alerts

### MVP Scope (No Automated Remediation)
This MVP focuses exclusively on **detection and analysis**. Automated remediation is explicitly out of scope to maintain focus, reduce risk, and allow the team to build confidence in AI recommendations.

---

## System Architecture

### High-Level Flow

```
Datadog Metrics/Errors
        ↓
Detection Service (Polling every 60s)
        ↓ [Anomaly Detected]
        ↓
Investigation Service (Parallel queries)
    ├→ GitLab (commits, diffs, MRs)
    ├→ Sourcegraph (code search)
    ├→ MS SQL Server (schema, data quality)
    └→ Datadog (stack traces, deployment events)
        ↓
Evidence Aggregation & Scoring
        ↓
Analysis Service (LangGraph + Gemini)
    ├→ LLM decides investigation strategy
    ├→ LLM synthesizes evidence
    └→ LLM generates root cause analysis
        ↓
Notification Service
        ↓
MS Teams (via Microsoft Graph API)
        ↓
MS SQL Server (incident storage)
```

### Component Responsibilities

1. **Detection Service** (Deterministic, No AI)
   - Polls Datadog metrics every 60 seconds
   - Calculates 7-day rolling baselines (cached in Redis)
   - Applies threshold-based anomaly detection
   - Emits incidents when anomalies detected

2. **Investigation Service** (Tool-Calling Agent)
   - Receives incident events
   - LLM analyzes incident to determine investigation strategy
   - Executes parallel investigations across multiple sources
   - Scores and filters evidence
   - LLM synthesizes evidence into focused bundle

3. **Analysis Service** (Single LLM Call)
   - Receives evidence bundle
   - Constructs structured prompt
   - Calls Google Gemini with JSON schema enforcement
   - Validates response with Zod
   - Caches analysis results

4. **Notification Service** (Deterministic, No AI)
   - Formats incident reports
   - Routes to appropriate MS Teams channels
   - Stores incidents in MS SQL Server

---

## Technology Stack

### Core Technologies
```json
{
  "runtime": "Node.js 20 LTS",
  "language": "TypeScript 5.3+",
  "packageManager": "pnpm",
  "webFramework": "Express.js",
  "container": "Docker",
  "deployment": "Azure Red Hat OpenShift (ARO)"
}
```

### Key Dependencies
```json
{
  "dependencies": {
    "@google/generative-ai": "^0.1.3",
    "@langchain/langgraph": "^0.0.19",
    "@langchain/core": "^0.1.0",
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "axios": "^1.6.0",
    "convict": "^6.2.4",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "ioredis": "^5.3.2",
    "mssql": "^10.0.1",
    "prom-client": "^15.1.0",
    "winston": "^3.11.0",
    "zod": "^3.22.4",
    "zod-to-json-schema": "^3.22.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.8",
    "@types/node": "^20.9.0",
    "@typescript-eslint/eslint-plugin": "^6.11.0",
    "@typescript-eslint/parser": "^6.11.0",
    "eslint": "^8.54.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.0",
    "supertest": "^6.3.3",
    "ts-jest": "^29.1.1",
    "ts-node": "^10.9.1",
    "typescript": "^5.3.2"
  }
}
```

### External Services
| Service | Purpose | Authentication | Status |
|---------|---------|----------------|--------|
| Datadog | Metrics, logs, traces, Error Tracking | API key + App key | Ready (Error Tracking enabled) |
| GitLab.com | Commit history, diffs, MRs, pipelines | Personal access token | Ready (SaaS) |
| Google Gemini | LLM analysis (1.5 Pro or Flash) | API key | Ready |
| MS SQL Server | Persistent storage + investigation target | Connection string | Pending approval |
| Redis | Caching layer | Connection string | To deploy |
| Sourcegraph | Cross-repo code search | API token | Ready (cloud) |
| MS Teams | Notifications | Azure AD app registration | Ready |
| DuckDuckGo | Web search (optional) | None | Optional |

---

## Implementation Strategy

### Recommended Approach: Sequential Phases

The project is divided into **6 sequential implementation phases**, each with detailed requirements documents:

1. **Phase 1: Foundation & Setup** (Document 01)
   - Project structure
   - Type definitions
   - Core utilities
   - Configuration management
   - ~3000 lines of code

2. **Phase 2: Detection Service** (Document 02)
   - Datadog client
   - Baseline calculation
   - Anomaly detection
   - Monitor management
   - ~2500 lines of code

3. **Phase 3: Investigation Service** (Document 03)
   - GitLab client
   - Sourcegraph client
   - Database investigation
   - Three-tier investigation strategy
   - ~3000 lines of code

4. **Phase 4: Analysis Service** (Document 04)
   - Google Gemini client
   - LangGraph workflow
   - Prompt engineering
   - Tool-calling agent
   - ~2500 lines of code

5. **Phase 5: Notification & API** (Document 05)
   - MS Teams client
   - REST API endpoints
   - Database operations
   - Authentication middleware
   - ~3500 lines of code

6. **Phase 6: Deployment & Testing** (Document 06)
   - Dockerfile
   - Kubernetes manifests
   - Database migrations
   - CI/CD pipeline
   - Integration tests
   - ~2000 lines + configs

**Total Estimated Output:** ~16,500 lines of production code

### Why Sequential Implementation Works

1. **Dependency Chain:** Each phase builds on previous ones
2. **Incremental Testing:** Verify functionality at each step
3. **Error Isolation:** Easier to debug when problems arise
4. **Cognitive Load:** Smaller chunks are easier to review
5. **Flexibility:** Can adjust approach based on early learnings

---

## Code Generation Phases

### Phase 1: Foundation & Setup

**Input to Claude Code:**
```
Please implement the foundation setup from 01-foundation-and-setup.md.

Focus on:
- Creating the exact project structure
- All TypeScript type definitions
- Core utilities (logger, errors, retry, circuit breaker, PII sanitizer)
- Prometheus metrics setup
- Configuration management with Convict
- Application bootstrap

Ensure all imports are correct and no circular dependencies exist.
```

**Verification Commands:**
```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
```

**Expected Artifacts:**
- Complete `/src` directory structure
- All type definitions in `/src/types`
- Utilities in `/src/utils`
- Configuration in `/src/config`
- Bootstrap in `/src/index.ts`
- Configuration files (package.json, tsconfig.json, etc.)

### Phase 2: Detection Service

**Input to Claude Code:**
```
Please implement the Detection Service from 02-detection-service.md.

This builds on Phase 1 and adds:
- DatadogClient with API integration
- BaselineCalculator with Redis caching
- AnomalyDetector with 3 threshold types
- MonitorManager with hot reload
- IncidentEmitter with deduplication
- DetectionService orchestrator

Include unit test examples for each component.
```

**Verification Commands:**
```bash
pnpm run test
pnpm run dev  # Should start polling without errors
```

**Expected Artifacts:**
- `/src/services/detection/` directory with all components
- `/tests/unit/detection/` with test files
- Example monitor configuration
- Server integration

### Phase 3: Investigation Service

**Input to Claude Code:**
```
Please implement the Investigation Service from 03-investigation-service.md.

This adds:
- GitLabClient (commits, diffs, MRs, pipelines)
- SourcegraphClient (GraphQL-based code search)
- DatabaseInvestigationClient (schema validation, data quality)
- InvestigationService orchestrator
- CommitScorer algorithm
- Three-tier investigation strategy implementation

Include error handling, caching, and rate limiting.
```

**Verification Commands:**
```bash
pnpm run test
pnpm run test:integration  # If integration tests exist
```

**Expected Artifacts:**
- `/src/services/investigation/` directory
- Client implementations for each external service
- Evidence aggregation logic
- Integration tests with mocked external APIs

### Phase 4: Analysis Service

**Input to Claude Code:**
```
Please implement the Analysis Service from 04-analysis-service.md.

This adds:
- GeminiClient integration
- LangGraph workflow definition
- Tool definitions for LLM function calling
- PromptEngine for template management
- AnalysisService orchestrator
- Response validation with Zod

Focus on the hybrid orchestration pattern: LLM-powered decision points 
within a deterministic pipeline.
```

**Verification Commands:**
```bash
pnpm run test
pnpm run test:llm  # Test LLM integration with real API
```

**Expected Artifacts:**
- `/src/services/analysis/` directory
- LangGraph workflow graph
- Prompt templates
- Tool calling implementation
- LLM response caching

### Phase 5: Notification & API

**Input to Claude Code:**
```
Please implement the Notification Service and REST API from 05-notification-and-api.md.

This adds:
- TeamsClient (Microsoft Graph API)
- NotificationService (message formatting, routing)
- Complete DatabaseClient (CRUD operations)
- REST API routes (incidents, monitors, health, metrics)
- Authentication middleware (API keys)
- Request/response validation
- OpenAPI spec generation

Ensure proper error handling and validation throughout.
```

**Verification Commands:**
```bash
pnpm run test
curl http://localhost:3000/health
curl -H "X-API-Key: test-key" http://localhost:3000/api/v1/incidents
```

**Expected Artifacts:**
- `/src/services/notification/` directory
- `/src/api/` directory with routes and controllers
- `/src/middleware/` with authentication
- Complete database client
- OpenAPI specification

### Phase 6: Deployment & Testing

**Input to Claude Code:**
```
Please implement the deployment configuration and testing suite from 06-deployment-and-testing.md.

This adds:
- Dockerfile (multi-stage build)
- Kubernetes manifests (Deployment, Service, ConfigMap, Secret, Redis)
- Database migrations (T-SQL for MS SQL Server)
- GitLab CI/CD pipeline
- Integration test suite with Docker Compose
- Test fixtures for all external APIs
- Deployment scripts

Ensure all manifests are production-ready with proper resource limits.
```

**Verification Commands:**
```bash
docker build -t incident-response-platform:test .
docker run --rm incident-response-platform:test npm test
kubectl apply -f k8s/
pnpm run test:integration
```

**Expected Artifacts:**
- `Dockerfile` with multi-stage build
- `/k8s` directory with all manifests
- `/migrations` directory with T-SQL files
- `.gitlab-ci.yml` pipeline
- `/tests/integration` suite
- Deployment scripts

---

## Key Design Patterns

### 1. Hybrid Orchestration Pattern

**Concept:** Combine deterministic pipeline with LLM-powered decision points

```typescript
// Detection: Deterministic (no AI)
async function detectAnomaly(metrics: Metric[]): Promise<Incident | null> {
  const baseline = await calculateBaseline(metrics);
  return thresholdCheck(metrics, baseline);
}

// Investigation: Tool-Calling Agent (AI-powered)
async function investigate(incident: Incident): Promise<Evidence> {
  // LLM decides which sources to query
  const strategy = await gemini.determineInvestigationStrategy(incident);
  
  // Execute investigations in parallel
  const investigations = [];
  if (strategy.needsGitLab) investigations.push(queryGitLab());
  if (strategy.needsDatabase) investigations.push(queryDatabase());
  if (strategy.needsSourcegraph) investigations.push(querySourcegraph());
  
  const rawEvidence = await Promise.all(investigations);
  
  // LLM synthesizes and filters evidence
  return await gemini.synthesizeEvidence(rawEvidence);
}

// Analysis: Single LLM Call (AI-powered)
async function analyze(evidence: Evidence): Promise<Analysis> {
  return await gemini.generateRootCauseAnalysis(evidence);
}

// Notification: Deterministic (no AI)
async function notify(analysis: Analysis): Promise<void> {
  const message = formatTeamsMessage(analysis);
  await teamsClient.sendMessage(message);
}
```

**Benefits:**
- Fast critical path (detection → notification < 5 minutes)
- Intelligent resource allocation (don't query unnecessary sources)
- Cost-efficient (fewer API calls to external services and LLM)
- Graceful degradation (if LLM fails, execute all investigations)

### 2. Three-Tier Investigation Strategy

**Tier 1 (Best Case - Conditional):** Datadog deployment tracking enabled
- Datadog directly provides commit SHA that caused the issue
- Time: ~5 seconds, Confidence: Very High
- Platform auto-detects availability

**Tier 2 (Good Case):** Stack trace available from Error Tracking
- Extract file path from stack trace
- Query only commits touching that specific file
- Time: ~15 seconds, Confidence: High

**Tier 3 (Fallback):** Only metric anomaly available
- Query all recent commits in configured repositories
- Score by temporal proximity + risk factors
- Time: ~30 seconds, Confidence: Medium

```typescript
async function investigateGitLab(incident: Incident): Promise<Commit[]> {
  // Tier 1: Check for deployment event
  if (incident.deploymentEvent?.commitSha) {
    return [await gitlabClient.getCommit(incident.deploymentEvent.commitSha)];
  }
  
  // Tier 2: Extract from stack trace
  if (incident.stackTrace) {
    const filePath = extractFilePath(incident.stackTrace);
    if (filePath) {
      return await gitlabClient.getCommitsTouching(filePath, incident.timestamp);
    }
  }
  
  // Tier 3: Temporal correlation
  return await gitlabClient.getRecentCommits(
    incident.repositories,
    incident.timestamp,
    LOOKBACK_WINDOW
  );
}
```

### 3. LangGraph Workflow

**State-Based Workflow:** Use LangGraph for investigation coordination

```typescript
import { StateGraph } from "@langchain/langgraph";

interface IncidentState {
  incident: Incident;
  datadogContext?: DatadogContext;
  gitlabCommits?: Commit[];
  databaseFindings?: DatabaseFindings;
  sourcegraphResults?: SourcegraphResults;
  investigationStrategy?: InvestigationStrategy;
  evidence?: Evidence;
  analysis?: Analysis;
}

const workflow = new StateGraph<IncidentState>({})
  .addNode("analyzeIncident", analyzeIncidentNode)
  .addNode("planInvestigation", planInvestigationNode)
  .addNode("investigateGitLab", investigateGitLabNode)
  .addNode("investigateDatabase", investigateDatabaseNode)
  .addNode("investigateSourcegraph", investigateSourcegraphNode)
  .addNode("synthesizeEvidence", synthesizeEvidenceNode)
  .addNode("generateAnalysis", generateAnalysisNode)
  
  // Conditional routing based on investigation strategy
  .addConditionalEdges(
    "planInvestigation",
    (state) => {
      if (state.investigationStrategy?.databaseOnly) return "investigateDatabase";
      if (state.investigationStrategy?.gitlabOnly) return "investigateGitLab";
      return "investigateGitLab"; // Default to full investigation
    },
    {
      "investigateDatabase": "investigateDatabase",
      "investigateGitLab": "investigateGitLab",
      "investigateSourcegraph": "investigateSourcegraph"
    }
  )
  
  .addEdge("investigateGitLab", "synthesizeEvidence")
  .addEdge("investigateDatabase", "synthesizeEvidence")
  .addEdge("investigateSourcegraph", "synthesizeEvidence")
  .addEdge("synthesizeEvidence", "generateAnalysis");
```

**Benefits:**
- Built-in state management
- Parallel execution support
- Conditional routing
- Easy to visualize and debug
- Checkpointing for long-running investigations

### 4. Circuit Breaker Pattern

**Protect against cascading failures:**

```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private lastFailureTime?: Date;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime!.getTime() > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}
```

### 5. Redis Caching Strategy

**Cache Layers:**

```typescript
// Layer 1: Baseline caching (7-day TTL)
const baselineKey = `baseline:${monitorId}:${dateBucket}`;
await redis.setex(baselineKey, 7 * 24 * 60 * 60, JSON.stringify(baseline));

// Layer 2: Metrics caching (5-minute TTL)
const metricsKey = `metrics:${query}:${timestamp}`;
await redis.setex(metricsKey, 5 * 60, JSON.stringify(metrics));

// Layer 3: Repository metadata caching (1-hour TTL)
const repoKey = `repo:${repoId}`;
await redis.setex(repoKey, 60 * 60, JSON.stringify(repoMetadata));

// Layer 4: LLM response caching (1-hour TTL, cost savings)
const analysisKey = `analysis:${incidentHash}`;
await redis.setex(analysisKey, 60 * 60, JSON.stringify(analysis));
```

---

## External Integrations

### Datadog API

**Endpoints Used:**
- `POST /api/v1/query` - Metrics query
- `GET /api/v2/logs/events/search` - Error Tracking
- `GET /api/v1/events` - Deployment events (optional)

**Authentication:**
```typescript
const headers = {
  'DD-API-KEY': process.env.DATADOG_API_KEY,
  'DD-APPLICATION-KEY': process.env.DATADOG_APP_KEY,
  'Content-Type': 'application/json'
};
```

**Key Considerations:**
- Rate limits: 300 requests per hour per organization
- Metrics API supports up to 2 years of retention
- Error Tracking requires specific configuration in Datadog
- Deployment tracking is optional (auto-detect availability)

### GitLab.com API

**Endpoints Used:**
- `GET /api/v4/projects/:id/repository/commits` - Recent commits
- `GET /api/v4/projects/:id/repository/commits/:sha` - Commit details
- `GET /api/v4/projects/:id/repository/commits/:sha/diff` - Commit diff
- `GET /api/v4/projects/:id/merge_requests` - MRs by commit
- `GET /api/v4/projects/:id/pipelines` - Pipeline status

**Authentication:**
```typescript
const headers = {
  'PRIVATE-TOKEN': process.env.GITLAB_TOKEN,
  'Content-Type': 'application/json'
};
```

**Key Considerations:**
- Rate limits: 10 requests per second per user
- Project ID can be numeric or URL-encoded namespace/project
- Pagination uses `page` and `per_page` parameters
- Token requires `api` and `read_repository` scopes

### Google Gemini API

**Models:**
- `gemini-1.5-pro` - High quality, slower, more expensive
- `gemini-1.5-flash` - Fast, cheaper, good quality

**Authentication:**
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
```

**Key Considerations:**
- JSON mode requires specific prompt formatting
- Function calling for tool selection
- Token limits: 32k input, 8k output (1.5 Pro)
- Pricing: ~$0.02-0.05 per incident analysis

### Microsoft Graph API (MS Teams)

**Endpoints Used:**
- `POST /v1.0/teams/{team-id}/channels/{channel-id}/messages` - Send message
- `POST /v1.0/subscriptions` - Webhook setup (future)

**Authentication:**
```typescript
import { Client } from "@microsoft/microsoft-graph-client";

const client = Client.init({
  authProvider: async (done) => {
    const token = await getAccessToken(); // Azure AD OAuth
    done(null, token);
  }
});
```

**Key Considerations:**
- Requires Azure AD app registration
- Permissions: `ChannelMessage.Send`, `Team.ReadBasic.All`
- Message format is Adaptive Cards JSON (future) or plain text (MVP)
- Rate limits: 4 requests per second per app

### Sourcegraph GraphQL API

**Query Example:**
```graphql
query SearchCode($query: String!) {
  search(query: $query) {
    results {
      results {
        ... on FileMatch {
          file {
            path
            repository {
              name
            }
          }
          lineMatches {
            lineNumber
            preview
          }
        }
      }
    }
  }
}
```

**Authentication:**
```typescript
const headers = {
  'Authorization': `token ${process.env.SOURCEGRAPH_TOKEN}`,
  'Content-Type': 'application/json'
};
```

**Key Considerations:**
- GraphQL endpoint: `https://<instance>/.api/graphql`
- Cloud version: `https://sourcegraph.com/.api/graphql`
- Rate limits: Generous for cloud (1000 requests/hour)
- Search syntax: regex, repo filters, file filters

### MS SQL Server

**Connection:**
```typescript
import sql from 'mssql';

const pool = await sql.connect({
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
});
```

**Key Considerations:**
- Use read-only account for database investigation
- Enforce query timeouts (30 seconds max)
- Enforce row limits (1000 rows max)
- PII sanitization required for all results
- Audit logging for all queries

---

## Testing Strategy

### Unit Tests

**Coverage Goals:**
- Utilities: 100%
- Services: 90%
- Clients: 85%
- API Routes: 90%

**Example Structure:**
```typescript
describe('AnomalyDetector', () => {
  describe('detectAbsolute', () => {
    it('should detect anomaly when value exceeds threshold', () => {
      const detector = new AnomalyDetector();
      const result = detector.detectAbsolute(100, 50, { critical: 75 });
      expect(result).toBeTruthy();
      expect(result!.severity).toBe('critical');
    });
    
    it('should return null when value is below threshold', () => {
      const detector = new AnomalyDetector();
      const result = detector.detectAbsolute(50, 40, { critical: 75 });
      expect(result).toBeNull();
    });
  });
});
```

### Integration Tests

**Test Scenarios:**
1. **End-to-End Incident Flow:**
   - Mock Datadog returning anomaly
   - Verify incident detection
   - Mock GitLab, Sourcegraph, Database responses
   - Verify evidence aggregation
   - Mock Gemini analysis response
   - Verify MS Teams notification sent
   - Verify incident stored in database

2. **Three-Tier Investigation:**
   - Test Tier 1 (deployment event present)
   - Test Tier 2 (stack trace present)
   - Test Tier 3 (fallback to temporal)

3. **Error Handling:**
   - External API failures (circuit breaker)
   - Timeout scenarios
   - Invalid responses
   - Network errors

**Example:**
```typescript
describe('Incident Response E2E', () => {
  beforeAll(async () => {
    // Start services with test configuration
    await startTestServices();
  });
  
  it('should detect, investigate, analyze, and notify', async () => {
    // 1. Mock Datadog anomaly
    mockDatadog.metrics.mockResolvedValueOnce({
      series: [{ pointlist: [[timestamp, 1000]] }]
    });
    
    // 2. Wait for detection
    await waitForIncident();
    
    // 3. Verify investigation calls
    expect(mockGitLab.getCommits).toHaveBeenCalled();
    expect(mockSourcegraph.search).toHaveBeenCalled();
    
    // 4. Verify analysis
    expect(mockGemini.generateContent).toHaveBeenCalled();
    
    // 5. Verify notification
    expect(mockTeams.sendMessage).toHaveBeenCalled();
    
    // 6. Verify storage
    const incident = await db.getIncident(incidentId);
    expect(incident).toBeDefined();
    expect(incident.status).toBe('analyzed');
  });
});
```

### Load Tests

**Scenarios:**
- 20 concurrent monitors polling every 60 seconds
- Burst of 10 incidents detected simultaneously
- API handling 100 requests per second

**Tools:**
- Apache JMeter or k6 for load testing
- Prometheus for metrics collection
- Grafana for visualization

---

## Development Workflow

### Local Development Setup

```bash
# 1. Clone repository
git clone https://gitlab.com/your-org/incident-response-platform.git
cd incident-response-platform

# 2. Install dependencies
pnpm install

# 3. Copy environment template
cp .env.example .env

# 4. Edit .env with your API keys
# DATADOG_API_KEY=...
# GITLAB_TOKEN=...
# GEMINI_API_KEY=...
# etc.

# 5. Start local dependencies
docker-compose up -d redis mssql

# 6. Run database migrations
pnpm run migrate:up

# 7. Start development server
pnpm run dev

# 8. Run tests
pnpm run test
pnpm run test:integration
```

### Git Workflow

```bash
# Feature branch from main
git checkout -b feature/investigation-service

# Make changes
git add .
git commit -m "feat: implement GitLab client"

# Push and create MR
git push origin feature/investigation-service

# After review, merge to main
# CI/CD pipeline automatically deploys
```

### CI/CD Pipeline (GitLab)

```yaml
stages:
  - lint
  - test
  - build
  - scan
  - deploy

lint:
  stage: lint
  script:
    - pnpm run lint
    - pnpm run typecheck

test:
  stage: test
  script:
    - pnpm run test
    - pnpm run test:integration

build:
  stage: build
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

scan:
  stage: scan
  script:
    - trivy image $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

deploy:
  stage: deploy
  script:
    - kubectl set image deployment/incident-response-platform \
        app=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main
```

---

## Critical Implementation Notes

### 1. Error Handling

**Every external API call must be wrapped:**

```typescript
async function callExternalAPI<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await circuitBreaker.execute(
      () => retryStrategy.execute(fn)
    );
  } catch (error) {
    logger.error('External API call failed', { error });
    metrics.externalApiErrors.inc({ service: 'datadog' });
    throw new ExternalServiceError('API call failed', { cause: error });
  }
}
```

### 2. PII Sanitization

**Required for all database query results:**

```typescript
const sanitizer = new PIISanitizer();

async function queryDatabase(sql: string): Promise<any[]> {
  const results = await pool.query(sql);
  return results.recordset.map(row => sanitizer.sanitize(row));
}
```

**Patterns to redact:**
- Email addresses
- Phone numbers
- Social Security Numbers
- Credit card numbers
- IP addresses (configurable)

### 3. Rate Limiting

**Implement for all external APIs:**

```typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: Date;
  
  async acquire(): Promise<void> {
    await this.refill();
    
    if (this.tokens < 1) {
      const waitTime = this.calculateWaitTime();
      await sleep(waitTime);
      await this.refill();
    }
    
    this.tokens--;
  }
  
  private async refill(): Promise<void> {
    const now = new Date();
    const elapsed = now.getTime() - this.lastRefill.getTime();
    const tokensToAdd = Math.floor(elapsed / this.refillInterval);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}
```

### 4. Graceful Shutdown

**Handle SIGTERM/SIGINT properly:**

```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  
  // 1. Stop accepting new requests
  server.close();
  
  // 2. Wait for ongoing requests to complete (max 30s)
  await waitForOngoingRequests(30000);
  
  // 3. Close database connections
  await db.close();
  await redis.quit();
  
  // 4. Flush metrics
  await metrics.close();
  
  logger.info('Graceful shutdown complete');
  process.exit(0);
});
```

### 5. Observability

**Comprehensive metrics:**

```typescript
// Counter metrics
metrics.incidentsDetected.inc({ severity: 'critical' });
metrics.investigationsCompleted.inc({ tier: '2' });
metrics.llmCalls.inc({ model: 'gemini-1.5-pro' });

// Histogram metrics
metrics.detectionDuration.observe(durationMs);
metrics.investigationDuration.observe(durationMs);
metrics.llmResponseTime.observe(durationMs);

// Gauge metrics
metrics.activeMonitors.set(monitorCount);
metrics.redisConnections.set(connectionCount);
```

**Structured logging:**

```typescript
logger.info('Incident detected', {
  incidentId,
  monitorId,
  severity: 'critical',
  metricName: 'api.errors.5xx',
  currentValue: 150,
  threshold: 100,
  timestamp: new Date().toISOString()
});
```

### 6. Security Best Practices

**Secrets Management:**
- Never commit API keys to Git
- Use environment variables or Kubernetes Secrets
- Rotate keys regularly

**API Authentication:**
- API keys stored as bcrypt hashes in database
- Compare with constant-time comparison
- Rate limit authentication attempts

**Database Security:**
- Read-only account for investigation queries
- Query timeouts enforced
- Row limits enforced
- PII sanitization applied
- Audit logging enabled

**Network Security:**
- TLS/SSL for all external communications
- Certificate validation enabled
- No insecure protocols

---

## Common Pitfalls to Avoid

### 1. ❌ Circular Dependencies

**Don't:**
```typescript
// services/detection/DetectionService.ts
import { InvestigationService } from '../investigation';

// services/investigation/InvestigationService.ts
import { DetectionService } from '../detection';
```

**Do:**
```typescript
// Use event emitters or dependency injection
class DetectionService {
  constructor(private eventEmitter: EventEmitter) {}
  
  async detect() {
    // Emit event instead of direct call
    this.eventEmitter.emit('incident.detected', incident);
  }
}
```

### 2. ❌ Unhandled Promise Rejections

**Don't:**
```typescript
// Missing error handling
datadog.query(metrics);  // Unhandled promise
```

**Do:**
```typescript
try {
  await datadog.query(metrics);
} catch (error) {
  logger.error('Query failed', { error });
  metrics.errors.inc({ type: 'datadog_query' });
  // Handle gracefully
}
```

### 3. ❌ Blocking Event Loop

**Don't:**
```typescript
// Synchronous processing of large data
const commits = await getAllCommits();  // 10,000 commits
commits.forEach(commit => processCommitSync(commit));  // Blocks event loop
```

**Do:**
```typescript
// Process in batches with setImmediate
async function processCommitsAsync(commits: Commit[]) {
  for (let i = 0; i < commits.length; i += 100) {
    const batch = commits.slice(i, i + 100);
    await processBatch(batch);
    await setImmediateAsync();  // Yield control
  }
}
```

### 4. ❌ Memory Leaks

**Don't:**
```typescript
// Event listener never removed
setInterval(() => pollDatadog(), 60000);  // Leaks if service restarts
```

**Do:**
```typescript
class DetectionService {
  private intervalId?: NodeJS.Timeout;
  
  start() {
    this.intervalId = setInterval(() => this.poll(), 60000);
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
```

### 5. ❌ Unbounded Caching

**Don't:**
```typescript
// Cache grows indefinitely
const cache = new Map<string, any>();
cache.set(key, value);  // Never evicted
```

**Do:**
```typescript
// Use Redis with TTL or LRU cache
await redis.setex(key, 3600, value);  // Expires after 1 hour

// Or implement LRU
const cache = new LRU({ max: 1000, maxAge: 3600000 });
```

### 6. ❌ Missing Input Validation

**Don't:**
```typescript
app.post('/api/incidents', (req, res) => {
  const incident = req.body;  // Unvalidated
  db.saveIncident(incident);
});
```

**Do:**
```typescript
app.post('/api/incidents', validate(incidentSchema), async (req, res) => {
  const incident = incidentSchema.parse(req.body);  // Zod validation
  await db.saveIncident(incident);
});
```

---

## Success Criteria

### Technical Metrics

- ✅ **MTTD:** < 2 minutes (95th percentile)
- ✅ **MTTU:** < 5 minutes (95th percentile)
- ✅ **Root Cause Accuracy:** > 70%
- ✅ **False Positive Rate:** < 5%
- ✅ **System Uptime:** > 99%
- ✅ **API Latency:** < 500ms (p95)
- ✅ **Test Coverage:** > 85%
- ✅ **Zero Critical Security Issues:** In production

### Functional Requirements

- ✅ **Monitor Management:** Support 20+ concurrent monitors
- ✅ **Hot Reload:** Update monitor configs without restart
- ✅ **Three-Tier Investigation:** Auto-detect best strategy
- ✅ **Multi-Source Evidence:** GitLab + Sourcegraph + Database + Datadog
- ✅ **LLM Analysis:** Google Gemini with structured output
- ✅ **MS Teams Notifications:** Rich formatted messages
- ✅ **API Access:** RESTful API for incident management
- ✅ **Observability:** Prometheus metrics + structured logs

### Performance Benchmarks

- ✅ **Detection:** < 10s per monitor check
- ✅ **Investigation Tier 1:** < 10s
- ✅ **Investigation Tier 2:** < 20s
- ✅ **Investigation Tier 3:** < 35s
- ✅ **Analysis:** < 30s (LLM call)
- ✅ **Notification:** < 5s
- ✅ **Total End-to-End:** < 120s (2 minutes)

### Business Metrics

- ✅ **Manual Investigation Time Reduction:** > 50%
- ✅ **On-Call Escalations Reduction:** > 25%
- ✅ **Engineer Satisfaction:** > 4/5 rating
- ✅ **Incidents with Automated Response:** > 90%

---

## Phase Completion Checklist

### Phase 1: Foundation ✅
- [ ] Project structure created
- [ ] All type definitions implemented
- [ ] Logger configured
- [ ] Error classes defined
- [ ] Retry strategy implemented
- [ ] Circuit breaker implemented
- [ ] PII sanitizer implemented
- [ ] Prometheus metrics setup
- [ ] Configuration management working
- [ ] Application bootstraps without errors
- [ ] All dependencies installed
- [ ] TypeScript compiles successfully
- [ ] Linter passes

### Phase 2: Detection ✅
- [ ] DatadogClient connects successfully
- [ ] Baseline calculation works
- [ ] Redis caching operational
- [ ] Anomaly detection accurate
- [ ] Monitor config validation works
- [ ] Hot reload functional
- [ ] Incident deduplication working
- [ ] Multiple monitors polling
- [ ] Unit tests pass (>85% coverage)
- [ ] Integration tests pass

### Phase 3: Investigation ✅
- [ ] GitLabClient retrieves commits
- [ ] Sourcegraph search working
- [ ] Database client connects (if approved)
- [ ] Three-tier strategy implemented
- [ ] Commit scoring algorithm accurate
- [ ] Evidence aggregation complete
- [ ] Parallel investigations work
- [ ] Rate limiting enforced
- [ ] Circuit breakers functional
- [ ] Unit tests pass (>85% coverage)

### Phase 4: Analysis ✅
- [ ] Gemini client working
- [ ] LangGraph workflow executes
- [ ] Tool calling functional
- [ ] Prompt templates loaded
- [ ] Evidence synthesis works
- [ ] Response validation passes
- [ ] LLM caching operational
- [ ] Structured output correct
- [ ] Cost tracking accurate
- [ ] Unit tests pass (>85% coverage)

### Phase 5: Notification & API ✅
- [ ] Teams client sends messages
- [ ] Message formatting correct
- [ ] Channel routing works
- [ ] Database CRUD operations work
- [ ] All API endpoints respond
- [ ] Authentication middleware works
- [ ] Request validation passes
- [ ] OpenAPI spec generated
- [ ] Health check functional
- [ ] Unit tests pass (>85% coverage)

### Phase 6: Deployment ✅
- [ ] Docker builds successfully
- [ ] Kubernetes manifests valid
- [ ] Database migrations run
- [ ] CI/CD pipeline works
- [ ] Integration tests pass
- [ ] Load tests complete
- [ ] Security scan passes
- [ ] Documentation complete
- [ ] Deployment successful
- [ ] Production metrics visible

---

## Quick Reference Commands

### Development
```bash
pnpm install              # Install dependencies
pnpm run dev              # Start development server
pnpm run build            # Build for production
pnpm run typecheck        # Check TypeScript types
pnpm run lint             # Run ESLint
pnpm run format           # Format with Prettier
```

### Testing
```bash
pnpm run test                    # Run unit tests
pnpm run test:watch              # Run tests in watch mode
pnpm run test:coverage           # Generate coverage report
pnpm run test:integration        # Run integration tests
pnpm run test:e2e                # Run end-to-end tests
```

### Database
```bash
pnpm run migrate:up              # Run migrations
pnpm run migrate:down            # Rollback migrations
pnpm run migrate:create <name>   # Create new migration
pnpm run db:seed                 # Seed test data
```

### Deployment
```bash
docker build -t incident-response:latest .     # Build Docker image
docker-compose up -d                           # Start local services
kubectl apply -f k8s/                          # Deploy to Kubernetes
kubectl logs -f deployment/incident-response   # View logs
kubectl port-forward svc/incident-response 3000:3000  # Local access
```

### Monitoring
```bash
curl http://localhost:3000/health              # Health check
curl http://localhost:3000/metrics             # Prometheus metrics
curl -H "X-API-Key: $API_KEY" \
  http://localhost:3000/api/v1/incidents       # List incidents
```

---

## Contact & Resources

**Project Repository:** [To be created on GitLab.com]  
**MS Teams Channel:** #incident-response-platform  
**Documentation:** See `/docs` directory in repository  
**Issue Tracking:** GitLab Issues  
**CI/CD:** GitLab CI/CD  

**External Documentation:**
- [Datadog API](https://docs.datadoghq.com/api/)
- [GitLab API](https://docs.gitlab.com/ee/api/)
- [Google Gemini](https://ai.google.dev/docs)
- [Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/overview)
- [Sourcegraph GraphQL](https://docs.sourcegraph.com/api/graphql)
- [LangGraph](https://langchain-ai.github.io/langgraph/)

---

## Appendix: File Structure Reference

```
incident-response-platform/
├── .env.example                    # Environment template
├── .eslintrc.js                    # ESLint config
├── .gitignore                      # Git ignore patterns
├── .prettierrc                     # Prettier config
├── Dockerfile                      # Multi-stage build
├── docker-compose.yml              # Local development services
├── jest.config.js                  # Jest configuration
├── package.json                    # Dependencies
├── pnpm-lock.yaml                  # Lockfile
├── tsconfig.json                   # TypeScript config
├── README.md                       # Project readme
├── CLAUDE.md                       # This file
│
├── docs/                           # Documentation
│   ├── 01-foundation-and-setup.md
│   ├── 02-detection-service.md
│   ├── 03-investigation-service.md
│   ├── 04-analysis-service.md
│   ├── 05-notification-and-api.md
│   └── 06-deployment-and-testing.md
│
├── k8s/                            # Kubernetes manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   └── redis.yaml
│
├── migrations/                     # Database migrations
│   ├── 001_initial_schema.sql
│   ├── 002_add_indexes.sql
│   └── ...
│
├── scripts/                        # Utility scripts
│   ├── generate-api-key.ts
│   ├── migrate.ts
│   └── health-check.sh
│
├── src/                            # Source code
│   ├── index.ts                    # Application entry point
│   ├── server.ts                   # Express server setup
│   │
│   ├── api/                        # REST API routes
│   │   ├── routes/
│   │   │   ├── incidents.ts
│   │   │   ├── monitors.ts
│   │   │   ├── health.ts
│   │   │   └── metrics.ts
│   │   ├── controllers/
│   │   │   ├── IncidentController.ts
│   │   │   └── MonitorController.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       ├── validation.ts
│   │       ├── errorHandler.ts
│   │       └── requestLogger.ts
│   │
│   ├── clients/                    # External service clients
│   │   ├── DatadogClient.ts
│   │   ├── GitLabClient.ts
│   │   ├── SourcegraphClient.ts
│   │   ├── DatabaseClient.ts
│   │   ├── RedisClient.ts
│   │   ├── GeminiClient.ts
│   │   └── TeamsClient.ts
│   │
│   ├── config/                     # Configuration
│   │   ├── index.ts
│   │   └── schema.ts
│   │
│   ├── services/                   # Business logic
│   │   ├── detection/
│   │   │   ├── DetectionService.ts
│   │   │   ├── MonitorManager.ts
│   │   │   ├── BaselineCalculator.ts
│   │   │   ├── AnomalyDetector.ts
│   │   │   └── IncidentEmitter.ts
│   │   ├── investigation/
│   │   │   ├── InvestigationService.ts
│   │   │   ├── CommitScorer.ts
│   │   │   └── EvidenceAggregator.ts
│   │   ├── analysis/
│   │   │   ├── AnalysisService.ts
│   │   │   ├── workflow.ts
│   │   │   └── PromptEngine.ts
│   │   └── notification/
│   │       └── NotificationService.ts
│   │
│   ├── types/                      # TypeScript types
│   │   ├── common.ts
│   │   ├── incident.ts
│   │   ├── evidence.ts
│   │   ├── analysis.ts
│   │   └── config.ts
│   │
│   └── utils/                      # Utilities
│       ├── logger.ts
│       ├── errors.ts
│       ├── retry.ts
│       ├── circuitBreaker.ts
│       ├── piiSanitizer.ts
│       └── metrics.ts
│
└── tests/                          # Tests
    ├── unit/
    │   ├── services/
    │   ├── clients/
    │   └── utils/
    ├── integration/
    │   ├── detection.test.ts
    │   ├── investigation.test.ts
    │   └── e2e.test.ts
    └── fixtures/
        ├── datadog-responses.json
        ├── gitlab-responses.json
        └── ...
```

---

**Document Version:** 1.0  
**Last Updated:** January 16, 2026  
**Status:** Ready for Claude Code Implementation

This guide provides everything Claude Code needs to successfully implement the AI-Powered Incident Response Platform. Follow the phases sequentially, refer to the detailed requirement documents (01-06), and use this guide as your primary reference for architecture, patterns, and best practices.

Good luck with the implementation! 🚀
