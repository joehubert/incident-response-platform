## Recommended Agentic Architecture

### 1. **Hybrid Orchestration Pattern** (Recommended)

For this project, I recommend a **hybrid approach** combining:

**Deterministic Pipeline (Core Flow)**
- Detection → Investigation → Analysis → Notification follows a fixed sequence
- Predictable, debuggable, low-latency
- Perfect for the critical path where speed matters

**LLM-Powered Decision Points (Strategic Layers)**
- **Investigation Router**: LLM decides which sources to query based on incident type
- **Evidence Synthesizer**: LLM prioritizes and filters evidence before final analysis
- **Action Recommender**: LLM generates specific remediation steps

```typescript
// Example: Investigation Router with LLM
async investigateIncident(incident: Incident): Promise<Evidence> {
  // Step 1: LLM analyzes initial incident data
  const strategy = await gemini.determineStrategy({
    errorMessage: incident.errorMessage,
    stackTrace: incident.stackTrace,
    metricName: incident.metricName
  });
  
  // Step 2: Execute investigations in parallel based on strategy
  const investigations = [];
  
  if (strategy.needsGitLabDeepDive) {
    investigations.push(this.gitlabService.investigate(incident, strategy.gitlabFocus));
  }
  if (strategy.needsDatabaseAnalysis) {
    investigations.push(this.databaseService.investigate(incident, strategy.databaseTables));
  }
  if (strategy.needsSourcegraphSearch) {
    investigations.push(this.sourcegraphService.search(incident, strategy.searchPatterns));
  }
  
  const evidence = await Promise.all(investigations);
  
  // Step 3: LLM synthesizes findings
  return await gemini.synthesizeEvidence(evidence);
}
```

**Why This Works:**
- ✅ Fast critical path (Datadog → Teams < 2 minutes)
- ✅ Intelligent resource allocation (don't query database if error is clearly code-related)
- ✅ Graceful degradation (if LLM fails, execute all investigations)
- ✅ Cost-efficient (fewer unnecessary API calls)

---

## 2. **Specific Tool Recommendations**

### LangGraph for Workflow Orchestration

**Why LangGraph over vanilla code:**

```typescript
import { StateGraph } from "@langchain/langgraph";

// Define agent state
interface IncidentState {
  incident: Incident;
  datadogContext?: DatadogContext;
  gitlabCommits?: Commit[];
  databaseFindings?: DatabaseFindings;
  sourcegraphResults?: SourcegraphResults;
  investigationStrategy?: InvestigationStrategy;
  analysis?: Analysis;
}

// Build workflow graph
const workflow = new StateGraph<IncidentState>({
  channels: {
    incident: null,
    datadogContext: null,
    // ... other state
  }
})
  .addNode("analyzeIncident", analyzeIncidentNode)
  .addNode("planInvestigation", planInvestigationNode)
  .addNode("investigateGitLab", investigateGitLabNode)
  .addNode("investigateDatabase", investigateDatabaseNode)
  .addNode("investigateSourcegraph", investigateSourcegraphNode)
  .addNode("synthesizeFindings", synthesizeFindingsNode)
  .addNode("generateAnalysis", generateAnalysisNode)
  .addNode("notifyTeams", notifyTeamsNode)
  
  // Conditional routing based on investigation strategy
  .addConditionalEdges(
    "planInvestigation",
    routeInvestigations,
    {
      "gitlab_only": "investigateGitLab",
      "database_only": "investigateDatabase",
      "full_investigation": "investigateGitLab" // Will parallel after
    }
  )
  
  .addEdge("investigateGitLab", "synthesizeFindings")
  .addEdge("investigateDatabase", "synthesizeFindings")
  .addEdge("investigateSourcegraph", "synthesizeFindings")
  .addEdge("synthesizeFindings", "generateAnalysis")
  .addEdge("generateAnalysis", "notifyTeams");

const app = workflow.compile();
```

**Benefits:**
- Built-in state management
- Parallel execution support
- Conditional routing
- Easy to visualize and debug
- Checkpointing for long-running investigations

---

### 3. **Tool-Calling Pattern for Investigation Sources**

**Use Gemini's function calling** to let the LLM decide which investigation tools to use:

```typescript
const tools = [
  {
    name: "query_gitlab_commits",
    description: "Search GitLab for commits in specified repositories within a time window. Use when error might be caused by recent code changes.",
    parameters: {
      type: "object",
      properties: {
        repositories: { type: "array", items: { type: "string" } },
        since: { type: "string", format: "date-time" },
        filePathFilter: { type: "string", description: "Optional: filter to specific file paths from stack trace" }
      }
    }
  },
  {
    name: "investigate_database",
    description: "Query MS SQL Server for schema issues, missing columns, NULL violations, or performance problems. Use when error suggests data/schema issues.",
    parameters: {
      type: "object",
      properties: {
        tables: { type: "array", items: { type: "string" } },
        investigationType: { 
          type: "string", 
          enum: ["schema_validation", "null_check", "missing_indexes", "slow_queries"] 
        }
      }
    }
  },
  {
    name: "search_sourcegraph",
    description: "Search across all repositories for code patterns, references, or recent changes. Use for cross-repo impact analysis.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        scope: { type: "string", enum: ["all_repos", "recent_changes", "symbol_references"] }
      }
    }
  }
];

// LLM decides which tools to use
const response = await gemini.generateContent({
  contents: [{
    role: "user",
    parts: [{
      text: `Analyze this incident and determine which investigation tools to use:
        Error: ${incident.errorMessage}
        Stack Trace: ${incident.stackTrace}
        Metric: ${incident.metricName}
        
        Available investigation tools: ${JSON.stringify(tools)}`
    }]
  }],
  tools: [{ functionDeclarations: tools }]
});

// Execute the tools the LLM selected
const toolCalls = response.functionCalls();
const results = await executeTools(toolCalls);
```

**Why This Matters:**
- **Cost Savings**: Don't query database if error is clearly a code bug
- **Speed**: Skip Sourcegraph if single-repo issue
- **Accuracy**: Focus investigation where it matters
- **Adaptability**: Handles edge cases you didn't anticipate

---

## 4. **MCP Server Pattern (Future-Ready)**

While not needed for MVP, design your investigation services as **proto-MCP servers**:

```typescript
// Current: Direct service calls
class InvestigationService {
  async investigateGitLab(incident: Incident): Promise<Commit[]> {
    // Direct implementation
  }
}

// Future-ready: MCP-compatible interface
class GitLabInvestigationTool {
  name = "investigate_gitlab_commits";
  description = "Query GitLab for recent commits that might have caused the incident";
  
  inputSchema = {
    type: "object",
    properties: {
      repositories: { type: "array" },
      timeWindow: { type: "string" },
      filePathHint: { type: "string" }
    }
  };
  
  async execute(params: GitLabInvestigationParams): Promise<ToolResult> {
    // Implementation
    return {
      content: commits,
      isError: false
    };
  }
}

// Can easily expose as MCP server later
const mcpServer = new Server({
  name: "incident-investigation-tools",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    new GitLabInvestigationTool(),
    new DatabaseInvestigationTool(),
    new SourcegraphSearchTool()
  ].map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }))
}));
```

**Benefits:**
- Easy migration to conversational interface (Phase 4)
- Tools can be used by other agents
- Consistent interface across investigation sources

---

## 5. **Recommended Agentic Patterns by Component**

### Detection Service: **No Agent** ✅
- Pure orchestration (cron-based polling)
- Threshold comparison logic
- Event emission
- **Rationale**: Speed-critical, deterministic, no decision-making needed

### Investigation Service: **Tool-Calling Agent** ✅
```typescript
async function intelligentInvestigation(incident: Incident) {
  // LLM analyzes incident
  const plan = await gemini.planInvestigation(incident, availableTools);
  
  // Execute investigation plan
  const evidence = await executeInvestigationPlan(plan);
  
  // LLM synthesizes evidence (filtering noise)
  return await gemini.synthesizeEvidence(evidence);
}
```

**Rationale**: 
- Different incidents need different investigation depth
- Reduces cost (skip unnecessary API calls)
- Improves accuracy (focused investigation)

### Analysis Service: **Single LLM Call** ✅
- Structured output with JSON schema
- No multi-step reasoning needed
- **Rationale**: Evidence is already gathered, just need synthesis

### Notification Service: **No Agent** ✅
- Template-based formatting
- Direct Teams API call
- **Rationale**: No decision-making, just formatting

---

## 6. **Anti-Patterns to Avoid**

### ❌ Full Multi-Agent System (Too Complex for MVP)
```typescript
// DON'T DO THIS (yet)
const investigationAgent = new Agent({
  role: "Investigation Coordinator",
  goal: "Gather all relevant evidence"
});

const gitlabAgent = new Agent({
  role: "GitLab Specialist",
  tools: [gitlabTool]
});

const databaseAgent = new Agent({
  role: "Database Specialist", 
  tools: [sqlTool]
});

// Agents negotiate and coordinate...
```

**Why Not:**
- Adds latency (agent-to-agent communication)
- Harder to debug
- Unpredictable behavior
- Overkill for deterministic workflow

**When to Consider:** Phase 5 (autonomous remediation requiring negotiation)

### ❌ ReAct Loop for Investigation
```typescript
// DON'T DO THIS
while (!resolved) {
  const thought = await llm.think();
  const action = await llm.decideAction();
  const result = await executeAction(action);
  if (llm.judgeComplete(result)) break;
}
```

**Why Not:**
- Too slow (2-minute MTTD requirement)
- Unpredictable number of LLM calls (cost)
- Can get stuck in loops

**When to Consider:** Conversational mode (Phase 4) where latency is acceptable

---

## 7. **Concrete Implementation Recommendations**

### Tech Stack for Agentic Layer

```json
{
  "dependencies": {
    "@google/generative-ai": "^0.1.3",
    "@langchain/langgraph": "^0.0.19",
    "@langchain/core": "^0.1.0",
    "zod": "^3.22.4",
    "zod-to-json-schema": "^3.22.4"
  }
}
```

### Repository Structure
```
/src
  /agents
    /investigation
      InvestigationCoordinator.ts     # Tool-calling agent
      tools/
        GitLabInvestigationTool.ts
        DatabaseInvestigationTool.ts
        SourcegraphSearchTool.ts
    /analysis
      AnalysisAgent.ts                # Single LLM synthesis
  /workflows
    incident-response.workflow.ts     # LangGraph definition
  /services
    detection/                        # Non-agentic
    notification/                     # Non-agentic
```

---

## 8. **Decision Framework: When to Use Agents**

Use an **agent** when:
- ✅ Multiple valid approaches exist (investigation strategy)
- ✅ Decision requires reasoning over context
- ✅ Trade-offs between speed/cost/accuracy
- ✅ Uncertainty about what information is needed

Use **deterministic code** when:
- ✅ Single correct approach (threshold detection)
- ✅ Speed-critical (< 100ms)
- ✅ Predictable inputs/outputs
- ✅ Regulatory/compliance requirements

---

## 9. **MVP Agentic Architecture (Final Recommendation)**

```
Detection Service (Non-Agentic)
    ↓ [Incident Event]
    ↓
Investigation Coordinator (Tool-Calling Agent)
    ├─→ Analyzes incident characteristics
    ├─→ Decides investigation strategy
    ├─→ Calls 1-4 investigation tools in parallel
    │   ├─ GitLab Tool (always)
    │   ├─ Database Tool (conditional)
    │   ├─ Sourcegraph Tool (conditional)
    │   └─ Datadog Deep Dive (conditional)
    └─→ Synthesizes evidence into focused bundle
        ↓
Analysis Agent (Single LLM Call)
    └─→ Generates root cause analysis (structured JSON)
        ↓
Notification Service (Non-Agentic)
    └─→ Formats and sends Teams message
```

### Estimated Latency Budget
- Detection: < 10s (polling + threshold check)
- Investigation: 30-60s (parallel API calls + LLM coordination)
- Analysis: 20-30s (single LLM call)
- Notification: < 5s (Teams API)
- **Total: 65-105s (well under 5-minute target)**

### Estimated Cost Per Incident
- Investigation LLM calls: 2-3 (strategy + synthesis)
- Analysis LLM call: 1
- **Total: ~3-4 LLM calls per incident**
- **Gemini 1.5 Pro cost: ~$0.02-0.05 per incident**

---

## Summary Recommendations

1. **Use LangGraph** for workflow orchestration (visibility, debugging, state management)
2. **Tool-calling agent** for investigation coordination (cost savings, speed)
3. **Single LLM call** for final analysis (structured output, deterministic)
4. **Avoid multi-agent complexity** for MVP (save for Phase 5)
5. **Design tools as proto-MCP** for future conversational interface
6. **Use Gemini function calling** instead of manual prompt engineering for tool selection

This gives you the **benefits of agentic reasoning** (adaptability, intelligence) without the **downsides** (latency, unpredictability, complexity) that would hurt your 2-minute MTTD and 5-minute MTTU targets.

Would you like me to elaborate on any of these patterns or show detailed implementation examples for specific components?