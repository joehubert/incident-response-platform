# Requirements Documents Overview & Guide
## AI-Powered Incident Response Platform - Claude Code Implementation

**Version:** 1.0  
**Date:** January 14, 2026

---

## Document Structure

This guide explains the complete set of requirements documents for Claude Code implementation of the incident response platform.

### Complete Document Set

1. ✅ **01-foundation-and-setup.md** - COMPLETE
   - Project structure and configuration
   - Type definitions
   - Core utilities (logging, errors, retry, circuit breaker, PII sanitization)
   - Prometheus metrics
   - Configuration management

2. ✅ **02-detection-service.md** - COMPLETE
   - Datadog client implementation
   - Baseline calculation with Redis caching
   - Anomaly detection (3 threshold types)
   - Monitor management with hot reload
   - Incident creation

3. ⏳ **03-investigation-service.md** - TO BE DETAILED
   - GitLab client (commits, diffs, MRs, pipelines)
   - Sourcegraph client (GraphQL queries, code search)
   - Database investigation client (schema validation, data quality, performance analysis)
   - Evidence aggregation
   - Commit scoring algorithm
   - Three-tier investigation strategy

4. ⏳ **04-analysis-service.md** - TO BE DETAILED
   - Google Gemini client integration
   - LangGraph workflow definition
   - Prompt engineering system
   - Tool-calling agent for investigation coordination
   - Evidence synthesis
   - Response validation with Zod
   - LLM response caching

5. ⏳ **05-notification-and-api.md** - TO BE DETAILED
   - MS Teams client (Microsoft Graph API)
   - Message formatting
   - REST API endpoints (incidents, monitors, health, metrics)
   - API authentication middleware
   - Request/response validation
   - Complete database operations
   - OpenAPI spec generation

6. ⏳ **06-deployment-and-testing.md** - TO BE DETAILED
   - Docker multi-stage build
   - Kubernetes manifests (Deployment, Service, ConfigMap, Secret, Redis)
   - Database migrations (T-SQL)
   - GitLab CI/CD pipeline
   - Integration test suite
   - Test fixtures and mocks
   - Deployment scripts

---

## How to Use These Documents with Claude Code

### Recommended Workflow

**Phase 1: Foundation**
```bash
# Feed Document 01 to Claude Code
"Please implement the foundation setup from 01-foundation-and-setup.md"

# Verify:
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
```

**Phase 2: Detection**
```bash
# Feed Document 02 to Claude Code
"Please implement the Detection Service from 02-detection-service.md"

# Verify:
pnpm run test
pnpm run dev  # Should start without errors
```

**Phase 3-6: Continue sequentially**
- Each document builds on previous ones
- Test after each phase
- Documents are designed to be independent but sequential

### Alternative: All at Once

You can feed all documents to Claude Code at once:
```bash
"Please implement the complete incident response platform using documents 01-06"
```

However, sequential implementation is recommended for:
- Better error isolation
- Incremental testing
- Easier debugging

---

## What I've Provided (Complete)

### Document 01: Foundation & Setup ✅
**Fully detailed and ready for Claude Code:**

- Complete project structure (exact directory tree)
- All configuration files (package.json, tsconfig.json, jest.config.js, etc.)
- Type definitions for all domain models:
  - `common.ts` - Shared types
  - `incident.ts` - Incident and monitor types
  - `evidence.ts` - Evidence bundle types
  - `analysis.ts` - Analysis result types
- Utility implementations:
  - Logger with Winston
  - Error classes (6 types)
  - Retry strategy with exponential backoff
  - Circuit breaker pattern
  - PII sanitizer
  - Prometheus metrics (14 metrics)
- Configuration management with Convict
- Application bootstrap
- Environment template

**Ready to generate:** ~3000 lines of code

### Document 02: Detection Service ✅
**Fully detailed and ready for Claude Code:**

- DatadogClient implementation:
  - Metrics query
  - Error Tracking query
  - Deployment events query (optional)
  - Auto-detection of deployment tracking
- BaselineCalculator with 7-day rolling averages
- AnomalyDetector with 3 threshold types:
  - Absolute
  - Percentage
  - Multiplier
- MonitorManager with Zod validation and hot reload
- IncidentEmitter with deduplication
- DetectionService orchestrator:
  - Multiple monitor polling
  - Configurable intervals
  - Graceful shutdown
- Database and Redis client stubs
- Server integration
- Example monitor configuration
- Unit test examples

**Ready to generate:** ~2500 lines of code

---

## What Needs to Be Detailed (Documents 03-06)

I recommend creating these following the same pattern as documents 01-02. Here's the high-level structure for each:

### Document 03: Investigation Service

**Key Components:**
1. **GitLabClient** - Complete implementation
   - Constructor with token authentication
   - Methods: `getRecentCommits()`, `getCommit()`, `getCommitDiff()`, `getMergeRequest()`, `getPipeline()`
   - Pagination handling
   - Rate limit handling
   - Caching with Redis

2. **SourcegraphClient** - Complete implementation
   - GraphQL client setup
   - Methods: `search()`, `searchRecent()`, `searchSymbols()`
   - Query builders for different search types
   - Result parsing and aggregation

3. **DatabaseInvestigationClient** - Complete implementation
   - Read-only connection
   - Methods: `validateSchema()`, `checkDataQuality()`, `analyzePerformance()`, `getDDLHistory()`
   - Query timeout enforcement
   - Row limit enforcement
   - PII sanitization of results
   - Audit logging

4. **InvestigationService** - Main orchestrator
   - Three-tier strategy implementation:
     - Tier 1: Use deployment event commit SHA
     - Tier 2: Extract file path from stack trace, query specific commits
     - Tier 3: Query all recent commits, score by temporal proximity
   - Parallel execution of investigation sources
   - Evidence aggregation
   - CommitScorer class for ranking commits

5. **Types for investigation**

**Estimated:** ~3000 lines

### Document 04: Analysis Service + LangGraph

**Key Components:**
1. **GeminiClient** - Complete implementation
   - Google Generative AI SDK setup
   - Methods: `generateAnalysis()`, `generateWithTools()`
   - Token counting
   - Cost calculation
   - Response caching
   - Timeout handling

2. **LangGraph Workflow** - Complete workflow definition
   - State interface for incident response
   - Nodes:
     - `analyzeIncident` - Initial incident analysis
     - `planInvestigation` - LLM decides which sources to use
     - `investigateGitLab` - Execute GitLab investigation
     - `investigateDatabase` - Execute DB investigation
     - `investigateSourcegraph` - Execute SG investigation
     - `synthesizeEvidence` - LLM filters and ranks evidence
     - `generateAnalysis` - Final root cause analysis
   - Conditional edges based on investigation strategy
   - Parallel execution support

3. **PromptEngine** - Prompt template system
   - Template loading
   - Variable substitution
   - Context window management (truncation strategies)

4. **AnalysisService** - Main orchestrator
   - Workflow execution
   - Fallback to templated analysis
   - Response validation

5. **Tool definitions** for LLM function calling

**Estimated:** ~2500 lines

### Document 05: Notification & REST API

**Key Components:**
1. **TeamsClient** - Complete implementation
   - Azure AD authentication
   - Microsoft Graph API client setup
   - Methods: `sendMessage()`, `sendToChannel()`, `sendToWebhook()`
   - Message formatting
   - Error handling

2. **NotificationService**
   - Message template system
   - URL generation from patterns
   - Channel routing logic

3. **Complete DatabaseClient**
   - All CRUD operations for incidents
   - Evidence storage
   - API key management
   - LLM usage tracking
   - Connection pooling

4. **REST API Routes**
   - `GET /api/v1/incidents` - List incidents (paginated)
   - `GET /api/v1/incidents/:id` - Get incident details
   - `PATCH /api/v1/incidents/:id` - Update incident
   - `GET /api/v1/monitors` - List monitors
   - `POST /api/v1/monitors/reload` - Reload configs
   - `GET /api/v1/metrics` - Platform metrics
   - `GET /health` - Health check

5. **Middleware**
   - API key authentication
   - Request validation
   - Error handling
   - Rate limiting
   - Logging

6. **Controllers** for each route

**Estimated:** ~3500 lines

### Document 06: Deployment & Testing

**Key Components:**
1. **Dockerfile** - Multi-stage build
   - Build stage with TypeScript compilation
   - Production stage with minimal footprint
   - Health check configuration
   - Non-root user

2. **Kubernetes Manifests**
   - Deployment with resource limits
   - Service (ClusterIP)
   - ConfigMap for configuration
   - Secret template
   - Redis Deployment
   - HorizontalPodAutoscaler (prepared but not enabled)

3. **Database Migrations**
   - Complete T-SQL schema
   - Migration runner script
   - Rollback scripts

4. **GitLab CI/CD**
   - Stages: lint, test, build, scan, deploy
   - Docker image building
   - Vulnerability scanning
   - Deployment to Kubernetes

5. **Integration Test Suite**
   - Test setup with Docker Compose
   - Fixtures for all external APIs
   - Test scenarios for each investigation tier
   - End-to-end workflow tests

6. **Scripts**
   - API key generation
   - Database migration
   - Health check

**Estimated:** ~2000 lines + YAML configs

---

## Total Estimated Code Generation

- **Document 01:** ~3000 lines (TypeScript + configs)
- **Document 02:** ~2500 lines (TypeScript + tests)
- **Document 03:** ~3000 lines (TypeScript + tests)
- **Document 04:** ~2500 lines (TypeScript + workflow)
- **Document 05:** ~3500 lines (TypeScript + API)
- **Document 06:** ~2000 lines (TypeScript + configs)

**Total:** ~16,500 lines of production code + tests + configurations

---

## Next Steps

### Option A: I Complete All Documents (Recommended)

I can create Documents 03-06 in the same detailed format as 01-02. This would give you:
- Complete, prescriptive specifications
- Exact class names, method signatures, interfaces
- All integration details
- Test examples
- Ready for Claude Code to generate everything

**Estimated time:** Additional session to complete remaining 4 documents

### Option B: You Use Documents 01-02 as Template

You can use the pattern from 01-02 to create 03-06 yourself, or have another Claude instance create them following the same structure.

### Option C: Iterative Approach

1. Use Document 01 to generate foundation
2. Use Document 02 to generate Detection Service
3. Request Documents 03-06 as needed (one at a time or together)

---

## Key Principles for Remaining Documents

All remaining documents should follow these principles:

1. **Exact Interface Specifications**
   - Every class has exact method signatures
   - All types are fully defined
   - No ambiguity about what to implement

2. **Separation of Concerns**
   - Each client handles one external service
   - Services orchestrate multiple clients
   - Clear boundaries between layers

3. **Error Handling**
   - Every external call wrapped in try-catch
   - Specific error types for different failures
   - Graceful degradation where possible

4. **Testing Support**
   - Stub/mock examples for external APIs
   - Integration test patterns
   - Test data fixtures

5. **Production Ready**
   - Metrics and logging throughout
   - Circuit breakers for external services
   - Retry logic with exponential backoff
   - Resource limits and timeouts

---

## Architecture Decisions Already Made

These are locked in across all documents:

✅ **Hybrid Orchestration:** LangGraph for workflow, not full multi-agent
✅ **Tool-Calling Agent:** For investigation coordination only
✅ **Single LLM Call:** For final analysis (no ReAct loop)
✅ **Deterministic Services:** Detection and notification
✅ **Three-Tier Investigation:** Tier 1 (deployment) → Tier 2 (stack trace) → Tier 3 (temporal)
✅ **Redis Caching:** Baselines, metrics, LLM responses, repo metadata
✅ **MS SQL Server:** All persistent storage
✅ **TypeScript + Node.js:** Runtime environment
✅ **Express.js:** REST API framework

---

## Questions Before I Continue?

Would you like me to:
1. **Generate all remaining documents (03-06) now** in the same detailed format?
2. **Generate them one at a time** as you progress through implementation?
3. **Provide high-level outlines** only for 03-06, and you fill in details?

Let me know your preference and I'll proceed accordingly!
