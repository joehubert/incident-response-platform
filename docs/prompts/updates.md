# Requirements Clarification Session Summary
## AI-Powered Incident Response Platform

**Date:** January 13, 2026  
**Participants:** Product Owner, Senior Software Architect  
**Purpose:** Clarify requirements from three source documents (MVP Requirements, Architecture Document, Platform Summary)

---

## Key Architecture Decisions

### 1. Datadog Deployment Tracking
- **Decision:** Optional configuration (Tier B approach)
- **Rationale:** Platform should auto-detect if deployment tracking is enabled and use Tier 1 strategy when available, gracefully falling back to Tier 2/3 when not
- **Impact:** Investigation Service must handle both scenarios flexibly

### 2. Datadog Error Tracking
- **Decision:** Assume Error Tracking is enabled and configured for all monitored services
- **Rationale:** Provides stack traces with file paths for Tier 2 investigation strategy
- **Impact:** Enables more precise commit correlation vs. broad temporal searches

### 3. MS SQL Server Access
- **Decision:** Proceed with read-only database integration design
- **Status:** Security/DBA approval not yet obtained but assumed to be granted
- **Action Item:** Product owner will handle approval process in parallel with development
- **Security Controls:** Read-only account, query timeouts, row limits, PII sanitization

### 4. Sourcegraph Integration
- **Status:** Already deployed (cloud-based) with full codebase coverage
- **Access:** Ready to use
- **Implementation:** Use GraphQL API directly (not MCP server)

### 5. GitLab Deployment
- **Type:** GitLab.com (SaaS)
- **Base URL:** `https://gitlab.com`
- **Authentication:** Personal access token with `api` and `read_repository` scopes
- **Access:** Token needs access to all repositories defined in monitor configurations

---

## Major Platform Changes from Original Documents

### Notification System: MS Teams (Not Slack)
- **Change:** Replace Slack integration with MS Teams
- **Authentication:** Azure AD App Registration with Microsoft Graph API permissions
- **Notification Target:** Determined by TBD context/configuration document mapping incident types to Teams channels
- **Message Format:** Plain text with URLs (no interactive buttons for MVP)
- **Pattern:** Fire-and-forget (no response handling)
- **URL Strategy:** TBD - configurable URL patterns based on incident type

### LLM Provider: Google Gemini (Not Claude)
- **Change:** Use Google Gemini instead of Anthropic Claude
- **Model Selection:** Configurable per deployment (likely Gemini 1.5 Pro or Flash)
- **Configuration:** Model specified in config file for flexibility
- **Impact:** 
  - Different SDK (Google Generative AI vs Anthropic)
  - Different pricing model
  - May require different prompt engineering approach
  - Need to verify structured output/JSON mode support

### Database: MS SQL Server (Not PostgreSQL)
- **Change:** Use MS SQL Server for all data storage
- **Schema:** Adapt PostgreSQL schema to MS SQL Server equivalents
- **Impact:** Connection library changes (mssql npm package)

### Caching: Redis Confirmed
- **Decision:** Include Redis from day one
- **Deployment:** Containerized in Azure environment
- **Purpose:** 
  - Baseline caching (avoid API rate limits with 20 monitors)
  - Metric response caching
  - Repository metadata caching
  - LLM response caching (cost savings)
  - Circuit breaker state
  - Rate limiting

---

## Infrastructure & Deployment

### Azure Red Hat OpenShift (ARO)
- **Status:** Details TBD (cluster access, namespace, registry, networking)
- **Approach:** Design for generic Kubernetes compatibility, finalize ARO specifics later
- **Container Registry:** TBD
- **Networking:** TBD

### Monitor Configuration
- **Approach:** Create example/template monitors for typical Node.js web application
- **Initial Set:** Product owner does not have specific monitors in mind
- **Examples Needed:** Design realistic scenarios (5xx errors, latency, memory, etc.)

---

## Integration Details

### Web Search
- **Priority:** Nice-to-have (not critical for MVP)
- **Provider:** DuckDuckGo
- **Rationale:** Free, no API setup required, reduces integration complexity

### External Service Summary
| Service | Status | Purpose |
|---------|--------|---------|
| Datadog | Ready (Error Tracking enabled) | Metrics, logs, traces, deployment events |
| GitLab.com | Ready | Commit history, diffs, MR details |
| MS SQL Server | Pending approval | Schema validation, data quality checks |
| Sourcegraph | Ready (cloud) | Cross-repo code search |
| Google Gemini | Ready (account + API keys) | Root cause analysis |
| MS Teams | Ready (can get auth setup) | Notifications |
| DuckDuckGo | Optional | Web search for error patterns |
| Redis | To deploy | Caching layer |

---

## API & Security

### REST API Authentication
- **Primary Consumer:** The agent itself (internal use)
- **Method:** API keys only (no Azure AD, no RBAC)
- **Authorization:** Simple authentication - valid key = full access
- **Scope:** No role-based or scope-based permissions for MVP

### Data Retention
- **Approach:** Manual data maintenance only for MVP
- **Incident Data:** 90-day retention mentioned but no automated cleanup
- **LLM Usage Data:** Manual management
- **Redis Cache:** Rely on TTL-based eviction
- **False Positives:** Keep for full retention period (manual cleanup)

---

## Implementation Context

### Team & Timeline
- **Team Size:** Small team (2-3 developers)
- **Timeline:** Very flexible (14-week plan is guideline, not constraint)
- **Development Approach:** Requirements documentation → Claude Code generation
- **Architect Role:** Multi-role including requirements documentation optimized for Claude Code

### Documentation Strategy
- **Current Status:** Three source documents exist (MVP Requirements, Architecture Doc, Platform Summary)
- **Next Steps:** 
  1. Product owner will start separate thread on agent workflow architecture
  2. Then create requirements documentation optimized for Claude Code
  3. Documentation format/structure TBD based on Claude Code needs

---

## Open Questions / TBD Items

### Critical (Blocking)
1. **Agent Workflow Architecture** - How should the agent workflow actually operate?
   - Original doc: Detection → Investigation (all sources) → Analysis → Notification
   - Potential alternative: Multi-agent with LLM decision points
   - **Status:** Product owner starting separate thread to design this

### Important (Can Proceed Without)
2. **MS Teams Channel Routing** - Context document mapping incidents to channels
3. **Notification URL Patterns** - What URLs to include in Teams messages
4. **ARO Environment Details** - Cluster, namespace, registry, networking
5. **Monitor Examples** - Specific monitors for Node.js web app (architect will create templates)
6. **Requirements Doc Format** - Structure optimized for Claude Code (to be determined)

### Nice-to-Have
7. **DuckDuckGo Integration Depth** - How much to invest in web search feature

---

## Key Takeaways

1. **Platform is more complex than originally scoped** - 7 external integrations plus custom agent logic
2. **Major technology swaps** - MS Teams, Gemini, MS SQL Server instead of Slack, Claude, PostgreSQL
3. **Workflow design is fundamental** - Needs separate design session before detailed requirements
4. **Claude Code implementation** - Requirements must be exceptionally detailed for code generation
5. **Flexible timeline** - Quality over speed, small team, iterative approach acceptable

---

## Next Actions

**Product Owner:**
1. Start separate thread on agent workflow architecture design
2. Work through workflow orchestration and decision points
3. Determine requirements documentation format for Claude Code
4. Initiate MS SQL Server read-only access approval process
5. Confirm Azure AD setup for MS Teams integration

**Architect:**
- **Status:** Ready to proceed once workflow design is finalized
- **Waiting On:** Workflow architecture decisions from separate thread
- **Can Provide:** Detailed requirements documentation formatted for Claude Code implementation

---

**Document Status:** Requirements clarification complete, awaiting workflow architecture design