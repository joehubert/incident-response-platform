# Requirements Document 01: Foundation & Project Setup
## AI-Powered Incident Response Platform - Claude Code Implementation Guide

**Version:** 1.0  
**Date:** January 14, 2026  
**Purpose:** Foundation, project structure, and core infrastructure setup

---

## Overview

This document provides prescriptive requirements for establishing the foundational structure of the incident response platform. Claude Code should use this as a blueprint for creating the initial project scaffolding, configuration management, and shared infrastructure components.

---

## 1. Project Structure

### 1.1 Directory Layout (REQUIRED - Exact Structure)

```
incident-response-platform/
├── src/
│   ├── index.ts                          # Application entry point
│   ├── server.ts                         # Express server setup
│   ├── config/
│   │   ├── index.ts                      # Configuration loader
│   │   ├── schema.ts                     # Configuration validation schemas
│   │   └── default.json                  # Default configuration values
│   ├── lib/
│   │   ├── clients/
│   │   │   ├── datadog/
│   │   │   │   ├── DatadogClient.ts     # Datadog API client
│   │   │   │   ├── types.ts              # Datadog type definitions
│   │   │   │   └── index.ts
│   │   │   ├── gitlab/
│   │   │   │   ├── GitLabClient.ts      # GitLab API client
│   │   │   │   ├── types.ts              # GitLab type definitions
│   │   │   │   └── index.ts
│   │   │   ├── gemini/
│   │   │   │   ├── GeminiClient.ts      # Google Gemini client
│   │   │   │   ├── types.ts              # Gemini type definitions
│   │   │   │   └── index.ts
│   │   │   ├── sourcegraph/
│   │   │   │   ├── SourcegraphClient.ts # Sourcegraph GraphQL client
│   │   │   │   ├── queries.ts            # GraphQL queries
│   │   │   │   ├── types.ts              # Sourcegraph type definitions
│   │   │   │   └── index.ts
│   │   │   ├── teams/
│   │   │   │   ├── TeamsClient.ts       # MS Teams Graph API client
│   │   │   │   ├── types.ts              # Teams type definitions
│   │   │   │   └── index.ts
│   │   │   ├── database/
│   │   │   │   ├── DatabaseClient.ts    # MS SQL Server client
│   │   │   │   ├── migrations/           # SQL migration files
│   │   │   │   ├── queries.ts            # Prepared queries
│   │   │   │   ├── types.ts              # Database type definitions
│   │   │   │   └── index.ts
│   │   │   └── redis/
│   │   │       ├── RedisClient.ts       # Redis client wrapper
│   │   │       ├── types.ts              # Redis type definitions
│   │   │       └── index.ts
│   │   ├── utils/
│   │   │   ├── logger.ts                 # Winston logger setup
│   │   │   ├── metrics.ts                # Prometheus metrics
│   │   │   ├── errors.ts                 # Custom error classes
│   │   │   ├── retry.ts                  # Retry strategy
│   │   │   ├── circuit-breaker.ts        # Circuit breaker pattern
│   │   │   ├── pii-sanitizer.ts         # PII sanitization
│   │   │   └── validation.ts             # Zod validation helpers
│   │   └── types/
│   │       ├── common.ts                 # Shared type definitions
│   │       ├── incident.ts               # Incident-related types
│   │       ├── evidence.ts               # Evidence-related types
│   │       └── analysis.ts               # Analysis-related types
│   ├── services/
│   │   ├── detection/                    # Detection service (next doc)
│   │   ├── investigation/                # Investigation service (next doc)
│   │   ├── analysis/                     # Analysis service (next doc)
│   │   └── notification/                 # Notification service (next doc)
│   ├── api/
│   │   ├── routes/                       # Express routes (next doc)
│   │   ├── controllers/                  # Request controllers (next doc)
│   │   └── middleware/                   # Express middleware (next doc)
│   └── workflows/
│       └── incident-response.workflow.ts # LangGraph workflow (next doc)
├── tests/
│   ├── unit/
│   │   ├── lib/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   ├── clients/
│   │   └── services/
│   └── fixtures/                         # Test data fixtures
├── config/
│   ├── monitors.json                     # Monitor configurations
│   └── monitors.schema.json              # Monitor JSON schema
├── scripts/
│   ├── generate-api-key.ts              # API key generation script
│   └── migrate-db.ts                     # Database migration runner
├── k8s/
│   ├── deployment.yaml                   # Kubernetes deployment
│   ├── service.yaml                      # Kubernetes service
│   ├── configmap.yaml                    # ConfigMap
│   ├── secret.yaml.example               # Secret template
│   └── redis.yaml                        # Redis deployment
├── docker/
│   ├── Dockerfile                        # Multi-stage Dockerfile
│   └── .dockerignore
├── .github/
│   └── workflows/
│       └── ci.yml                        # GitHub Actions CI (optional)
├── .gitlab-ci.yml                        # GitLab CI pipeline
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
├── .env.example
└── README.md
```

---

## 2. Package Configuration

### 2.1 package.json (REQUIRED)

```json
{
  "name": "incident-response-platform",
  "version": "1.0.0",
  "description": "AI-powered incident detection and root cause analysis platform",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "test:unit": "jest --testPathPattern=tests/unit",
    "test:integration": "jest --testPathPattern=tests/integration",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "migrate": "tsx scripts/migrate-db.ts",
    "generate-key": "tsx scripts/generate-api-key.ts"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "zod": "^3.22.4",
    "winston": "^3.11.0",
    "convict": "^6.2.4",
    "dotenv": "^16.3.1",
    "mssql": "^10.0.1",
    "ioredis": "^5.3.2",
    "@google/generative-ai": "^0.1.3",
    "@langchain/langgraph": "^0.0.19",
    "@langchain/core": "^0.1.0",
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "@azure/identity": "^4.0.0",
    "prom-client": "^15.1.0",
    "swagger-ui-express": "^5.0.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/swagger-ui-express": "^4.1.6",
    "@types/jest": "^29.5.10",
    "@types/supertest": "^6.0.2",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "supertest": "^6.3.3",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "@typescript-eslint/parser": "^6.13.0",
    "eslint": "^8.54.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-prettier": "^5.0.1",
    "prettier": "^3.1.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

### 2.2 tsconfig.json (REQUIRED)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 2.3 jest.config.js (REQUIRED)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
```

### 2.4 .eslintrc.js (REQUIRED)

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  env: {
    node: true,
    jest: true,
  },
};
```

### 2.5 .prettierrc (REQUIRED)

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

---

## 3. Core Type Definitions

### 3.1 src/lib/types/common.ts (REQUIRED - Exact Interfaces)

```typescript
/**
 * Common type definitions shared across the platform
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type IncidentStatus = 'active' | 'resolved' | 'false_positive';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ComplexityLevel = 'low' | 'medium' | 'high';

export type InvestigationTier = 'tier1' | 'tier2' | 'tier3';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface Threshold {
  type: 'absolute' | 'percentage' | 'multiplier';
  warning: number;
  critical: number;
}

export interface MetricValue {
  timestamp: Date;
  value: number;
}

export interface BaselineData {
  hourOfDay: number;
  averageValue: number;
  standardDeviation: number;
  sampleCount: number;
  calculatedAt: Date;
}

export interface ApiKeyMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface HealthStatus {
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

export interface ComponentHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### 3.2 src/lib/types/incident.ts (REQUIRED - Exact Interfaces)

```typescript
import type { Severity, IncidentStatus, InvestigationTier, Threshold } from './common';

export interface Incident {
  id: string;
  externalId: string;
  monitorId: string;
  serviceName: string;
  severity: Severity;
  status: IncidentStatus;
  investigationTier: InvestigationTier;
  
  // Metric details
  metricName: string;
  metricValue: number;
  baselineValue: number;
  thresholdValue: number;
  deviationPercentage: number;
  
  // Error context
  errorMessage?: string;
  stackTrace?: string;
  
  // Timestamps
  detectedAt: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Metadata
  tags: string[];
}

export interface IncidentCreateInput {
  monitorId: string;
  serviceName: string;
  severity: Severity;
  metricName: string;
  metricValue: number;
  baselineValue: number;
  thresholdValue: number;
  errorMessage?: string;
  stackTrace?: string;
  tags?: string[];
}

export interface MonitorConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Queries
  queries: {
    metric: string;
    errorTracking?: string;
    deployment?: string;
  };
  
  // Detection settings
  checkIntervalSeconds: number;
  threshold: Threshold;
  timeWindow: string;
  
  // Investigation settings
  gitlabRepositories: string[];
  enableDatabaseInvestigation: boolean;
  databaseContext?: {
    relevantTables: string[];
    relevantSchemas: string[];
  };
  
  // Notification settings
  teamsNotification: {
    channelWebhookUrl: string;
    mentionUsers?: string[];
    urlPatterns?: {
      datadog?: string;
      gitlab?: string;
      incident?: string;
    };
  };
  
  // Metadata
  tags: string[];
  severity: Severity;
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  severity: Severity;
  currentValue: number;
  baselineValue: number;
  thresholdValue: number;
  deviationPercentage: number;
  detectedAt: Date;
}
```

### 3.3 src/lib/types/evidence.ts (REQUIRED - Exact Interfaces)

```typescript
import type { InvestigationTier, ConfidenceLevel } from './common';

export interface EvidenceBundle {
  incidentId: string;
  investigationTier: InvestigationTier;
  completeness: number; // 0-1 scale
  collectedAt: Date;
  
  datadogContext: DatadogContext;
  gitlabContext?: GitLabContext;
  databaseContext?: DatabaseContext;
  sourcegraphContext?: SourcegraphContext;
  
  warnings?: string[];
}

export interface DatadogContext {
  errorDetails?: {
    errorMessage: string;
    stackTrace: string;
    filePath?: string;
    lineNumber?: number;
  };
  deploymentEvent?: {
    commitSha: string;
    repository: string;
    timestamp: Date;
  };
  metricHistory: Array<{
    timestamp: Date;
    value: number;
  }>;
}

export interface GitLabContext {
  commits: CommitInfo[];
  scoringMethod: 'deployment' | 'stack-trace' | 'temporal';
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  timestamp: Date;
  repository: string;
  
  // Diff information
  diff?: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  
  // Scoring
  score: CommitScore;
  
  // Additional context
  mergeRequest?: {
    id: number;
    title: string;
    url: string;
  };
  pipeline?: {
    status: 'success' | 'failed' | 'running' | 'canceled';
    url: string;
  };
}

export interface CommitScore {
  temporal: number; // 0-1 scale based on time proximity
  risk: number; // 0-1 scale based on risk factors
  combined: number; // weighted combination
}

export interface DatabaseContext {
  schemaFindings: SchemaFinding[];
  dataFindings: DataFinding[];
  performanceFindings: PerformanceFinding[];
  relevance: ConfidenceLevel;
}

export interface SchemaFinding {
  type: 'missing_column' | 'missing_table' | 'type_mismatch' | 'constraint_violation';
  severity: ConfidenceLevel;
  description: string;
  tableName: string;
  columnName?: string;
  expected?: string;
  actual?: string;
}

export interface DataFinding {
  type: 'unexpected_nulls' | 'missing_fk_references' | 'duplicate_keys' | 'invalid_data';
  severity: ConfidenceLevel;
  description: string;
  tableName: string;
  affectedRows: number;
  sampleData?: any[];
}

export interface PerformanceFinding {
  type: 'missing_index' | 'slow_query' | 'table_scan' | 'lock_contention';
  severity: ConfidenceLevel;
  description: string;
  recommendation: string;
  estimatedImpact?: string;
}

export interface SourcegraphContext {
  affectedRepositories: number;
  estimatedReferences: number;
  criticalPaths: string[];
  matches: SourcegraphMatch[];
}

export interface SourcegraphMatch {
  repository: string;
  filePath: string;
  lineNumber: number;
  preview: string;
  matchCount: number;
}
```

### 3.4 src/lib/types/analysis.ts (REQUIRED - Exact Interfaces)

```typescript
import type { ConfidenceLevel, ComplexityLevel } from './common';

export interface IncidentAnalysis {
  incidentId: string;
  summary: string;
  
  rootCause: RootCauseAnalysis;
  mechanism: string;
  
  databaseFindings?: DatabaseAnalysis;
  crossRepoImpact?: CrossRepoImpact;
  
  contributingFactors: string[];
  recommendedActions: RecommendedAction[];
  
  estimatedComplexity: ComplexityLevel;
  requiresHumanReview: boolean;
  requiresRollback?: boolean;
  
  metadata: {
    analyzedAt: Date;
    modelUsed: string;
    tokensUsed: {
      input: number;
      output: number;
      total: number;
    };
    durationMs: number;
  };
}

export interface RootCauseAnalysis {
  hypothesis: string;
  confidence: ConfidenceLevel;
  evidence: string[];
  suspectedCommit?: {
    sha: string;
    repository: string;
    reason: string;
  };
}

export interface DatabaseAnalysis {
  schemaIssues: string[];
  dataIssues: string[];
  relevance: ConfidenceLevel;
}

export interface CrossRepoImpact {
  affectedRepositories: number;
  estimatedReferences: number;
  criticalPaths: string[];
}

export interface RecommendedAction {
  priority: number;
  action: string;
  reasoning: string;
  estimatedImpact: string;
}

export interface LLMUsageRecord {
  id: string;
  incidentId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelName: string;
  requestDurationMs: number;
  estimatedCostUsd: number;
  createdAt: Date;
}
```

---

## 4. Configuration Management

### 4.1 src/config/schema.ts (REQUIRED - Exact Schema)

```typescript
import convict from 'convict';

export const configSchema = convict({
  server: {
    port: {
      doc: 'HTTP server port',
      format: 'port',
      default: 3000,
      env: 'PORT',
    },
    logLevel: {
      doc: 'Logging level',
      format: ['debug', 'info', 'warn', 'error'],
      default: 'info',
      env: 'LOG_LEVEL',
    },
  },
  
  datadog: {
    apiKey: {
      doc: 'Datadog API key',
      format: String,
      default: '',
      env: 'DATADOG_API_KEY',
      sensitive: true,
    },
    appKey: {
      doc: 'Datadog application key',
      format: String,
      default: '',
      env: 'DATADOG_APP_KEY',
      sensitive: true,
    },
    site: {
      doc: 'Datadog site',
      format: String,
      default: 'datadoghq.com',
      env: 'DATADOG_SITE',
    },
    errorTrackingEnabled: {
      doc: 'Whether Error Tracking is enabled',
      format: Boolean,
      default: true,
      env: 'DATADOG_ERROR_TRACKING_ENABLED',
    },
    deploymentTrackingEnabled: {
      doc: 'Whether Deployment Tracking is enabled (optional)',
      format: Boolean,
      default: false,
      env: 'DATADOG_DEPLOYMENT_TRACKING_ENABLED',
    },
  },
  
  gitlab: {
    url: {
      doc: 'GitLab base URL',
      format: 'url',
      default: 'https://gitlab.com',
      env: 'GITLAB_URL',
    },
    token: {
      doc: 'GitLab personal access token',
      format: String,
      default: '',
      env: 'GITLAB_TOKEN',
      sensitive: true,
    },
  },
  
  gemini: {
    apiKey: {
      doc: 'Google Gemini API key',
      format: String,
      default: '',
      env: 'GEMINI_API_KEY',
      sensitive: true,
    },
    model: {
      doc: 'Gemini model name',
      format: String,
      default: 'gemini-1.5-pro',
      env: 'GEMINI_MODEL',
    },
    maxTokens: {
      doc: 'Maximum tokens per request',
      format: 'nat',
      default: 4000,
      env: 'GEMINI_MAX_TOKENS',
    },
    temperature: {
      doc: 'Model temperature',
      format: Number,
      default: 0.2,
      env: 'GEMINI_TEMPERATURE',
    },
  },
  
  msTeams: {
    tenantId: {
      doc: 'Azure AD tenant ID',
      format: String,
      default: '',
      env: 'MS_TEAMS_TENANT_ID',
    },
    clientId: {
      doc: 'Azure AD client ID',
      format: String,
      default: '',
      env: 'MS_TEAMS_CLIENT_ID',
    },
    clientSecret: {
      doc: 'Azure AD client secret',
      format: String,
      default: '',
      env: 'MS_TEAMS_CLIENT_SECRET',
      sensitive: true,
    },
    defaultChannelWebhook: {
      doc: 'Default Teams channel webhook URL',
      format: String,
      default: '',
      env: 'MS_TEAMS_DEFAULT_WEBHOOK',
    },
  },
  
  database: {
    host: {
      doc: 'MS SQL Server host',
      format: String,
      default: 'localhost',
      env: 'DB_HOST',
    },
    port: {
      doc: 'MS SQL Server port',
      format: 'port',
      default: 1433,
      env: 'DB_PORT',
    },
    database: {
      doc: 'Database name',
      format: String,
      default: 'incident_response',
      env: 'DB_NAME',
    },
    username: {
      doc: 'Database username',
      format: String,
      default: 'sa',
      env: 'DB_USERNAME',
    },
    password: {
      doc: 'Database password',
      format: String,
      default: '',
      env: 'DB_PASSWORD',
      sensitive: true,
    },
    readOnlyInvestigation: {
      enabled: {
        doc: 'Enable read-only database investigation',
        format: Boolean,
        default: true,
        env: 'DB_INVESTIGATION_ENABLED',
      },
      timeoutSeconds: {
        doc: 'Query timeout in seconds',
        format: 'nat',
        default: 10,
        env: 'DB_INVESTIGATION_TIMEOUT',
      },
      maxRows: {
        doc: 'Maximum rows to return',
        format: 'nat',
        default: 100,
        env: 'DB_INVESTIGATION_MAX_ROWS',
      },
      auditLogging: {
        doc: 'Enable audit logging for queries',
        format: Boolean,
        default: true,
        env: 'DB_INVESTIGATION_AUDIT',
      },
    },
  },
  
  redis: {
    host: {
      doc: 'Redis host',
      format: String,
      default: 'localhost',
      env: 'REDIS_HOST',
    },
    port: {
      doc: 'Redis port',
      format: 'port',
      default: 6379,
      env: 'REDIS_PORT',
    },
    password: {
      doc: 'Redis password',
      format: String,
      default: '',
      env: 'REDIS_PASSWORD',
      sensitive: true,
    },
    ttl: {
      baseline: {
        doc: 'Baseline cache TTL (seconds)',
        format: 'nat',
        default: 86400,
        env: 'REDIS_TTL_BASELINE',
      },
      metrics: {
        doc: 'Metrics cache TTL (seconds)',
        format: 'nat',
        default: 300,
        env: 'REDIS_TTL_METRICS',
      },
      repoMetadata: {
        doc: 'Repository metadata cache TTL (seconds)',
        format: 'nat',
        default: 3600,
        env: 'REDIS_TTL_REPO_METADATA',
      },
      llmResponses: {
        doc: 'LLM response cache TTL (seconds)',
        format: 'nat',
        default: 3600,
        env: 'REDIS_TTL_LLM',
      },
    },
  },
  
  sourcegraph: {
    url: {
      doc: 'Sourcegraph instance URL',
      format: 'url',
      default: 'https://sourcegraph.com',
      env: 'SOURCEGRAPH_URL',
    },
    token: {
      doc: 'Sourcegraph access token',
      format: String,
      default: '',
      env: 'SOURCEGRAPH_TOKEN',
      sensitive: true,
    },
    maxResults: {
      doc: 'Maximum search results',
      format: 'nat',
      default: 10,
      env: 'SOURCEGRAPH_MAX_RESULTS',
    },
  },
  
  webSearch: {
    enabled: {
      doc: 'Enable web search (optional)',
      format: Boolean,
      default: false,
      env: 'WEB_SEARCH_ENABLED',
    },
    provider: {
      doc: 'Web search provider',
      format: ['duckduckgo'],
      default: 'duckduckgo',
      env: 'WEB_SEARCH_PROVIDER',
    },
    maxSearches: {
      doc: 'Maximum searches per investigation',
      format: 'nat',
      default: 3,
      env: 'WEB_SEARCH_MAX_SEARCHES',
    },
  },
  
  monitoring: {
    configPath: {
      doc: 'Path to monitors configuration file',
      format: String,
      default: './config/monitors.json',
      env: 'MONITORS_CONFIG_PATH',
    },
    hotReloadEnabled: {
      doc: 'Enable hot reload of monitor configs',
      format: Boolean,
      default: true,
      env: 'MONITORS_HOT_RELOAD',
    },
  },
});

export type PlatformConfig = ReturnType<typeof configSchema.getProperties>;
```

### 4.2 src/config/index.ts (REQUIRED)

```typescript
import { configSchema } from './schema';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Load configuration file if it exists
const configFile = process.env.CONFIG_FILE || './config/default.json';
const configPath = path.resolve(process.cwd(), configFile);

try {
  configSchema.loadFile(configPath);
} catch (error) {
  console.warn(`Could not load config file from ${configPath}, using defaults and env vars`);
}

// Validate configuration
configSchema.validate({ allowed: 'strict' });

// Export configuration
export const config = configSchema.getProperties();

// Export for use in other modules
export { configSchema };
export type { PlatformConfig } from './schema';
```

### 4.3 src/config/default.json (EXAMPLE)

```json
{
  "server": {
    "port": 3000,
    "logLevel": "info"
  },
  "datadog": {
    "site": "datadoghq.com",
    "errorTrackingEnabled": true,
    "deploymentTrackingEnabled": false
  },
  "gitlab": {
    "url": "https://gitlab.com"
  },
  "gemini": {
    "model": "gemini-1.5-pro",
    "maxTokens": 4000,
    "temperature": 0.2
  },
  "database": {
    "host": "localhost",
    "port": 1433,
    "database": "incident_response",
    "readOnlyInvestigation": {
      "enabled": true,
      "timeoutSeconds": 10,
      "maxRows": 100,
      "auditLogging": true
    }
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "ttl": {
      "baseline": 86400,
      "metrics": 300,
      "repoMetadata": 3600,
      "llmResponses": 3600
    }
  },
  "sourcegraph": {
    "url": "https://sourcegraph.com",
    "maxResults": 10
  },
  "webSearch": {
    "enabled": false,
    "provider": "duckduckgo",
    "maxSearches": 3
  },
  "monitoring": {
    "configPath": "./config/monitors.json",
    "hotReloadEnabled": true
  }
}
```

---

## 5. Logging Infrastructure

### 5.1 src/lib/utils/logger.ts (REQUIRED - Exact Implementation)

```typescript
import winston from 'winston';
import { config } from '../../config';

const { combine, timestamp, json, printf, colorize } = winston.format;

// Custom format for console output (development)
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Production format (JSON)
const productionFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  json()
);

// Development format (colorized console)
const developmentFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  consoleFormat
);

const isProduction = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: config.server.logLevel,
  format: isProduction ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'incident-response-platform',
    version: process.env.APP_VERSION || '1.0.0',
  },
  transports: [
    new winston.transports.Console(),
  ],
});

// Extend logger with correlation ID support
export function createChildLogger(correlationId: string) {
  return logger.child({ correlationId });
}

// Export logger instance
export default logger;
```

---

## 6. Error Classes

### 6.1 src/lib/utils/errors.ts (REQUIRED - Exact Classes)

```typescript
export class PlatformError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'PlatformError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends PlatformError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
    this.name = 'ConfigurationError';
  }
}

export class ExternalAPIError extends PlatformError {
  constructor(
    service: string,
    message: string,
    public originalError?: Error,
    details?: any
  ) {
    super(
      `${service} API error: ${message}`,
      'EXTERNAL_API_ERROR',
      502,
      details
    );
    this.name = 'ExternalAPIError';
  }
}

export class DatabaseError extends PlatformError {
  constructor(message: string, public originalError?: Error, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AnalysisError extends PlatformError {
  constructor(message: string, details?: any) {
    super(message, 'ANALYSIS_ERROR', 500, details);
    this.name = 'AnalysisError';
  }
}

export class CacheError extends PlatformError {
  constructor(message: string, public originalError?: Error, details?: any) {
    super(message, 'CACHE_ERROR', 500, details);
    this.name = 'CacheError';
  }
}

export class AuthenticationError extends PlatformError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}
```

---

## 7. Retry Strategy

### 7.1 src/lib/utils/retry.ts (REQUIRED - Exact Implementation)

```typescript
import logger from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error) => boolean;
}

export class RetryStrategy {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffMultiplier: number;
  private readonly shouldRetry: (error: Error) => boolean;

  constructor(options: RetryOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 10000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.shouldRetry = options.shouldRetry ?? (() => true);
  }

  async execute<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.maxRetries || !this.shouldRetry(lastError)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        
        logger.warn('Operation failed, retrying', {
          context,
          attempt,
          maxRetries: this.maxRetries,
          delayMs: delay,
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.baseDelayMs * Math.pow(this.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
    
    // Add jitter (±30%)
    const jitter = cappedDelay * 0.3 * (Math.random() - 0.5);
    
    return Math.floor(cappedDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Default retry strategy
export const defaultRetry = new RetryStrategy();
```

---

## 8. Circuit Breaker

### 8.1 src/lib/utils/circuit-breaker.ts (REQUIRED - Exact Implementation)

```typescript
import logger from './logger';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? 60000; // 60 seconds
    this.name = options.name ?? 'unnamed';
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }
      
      // Transition to half-open
      this.state = 'half-open';
      this.successes = 0;
      logger.info(`Circuit breaker '${this.name}' transitioning to HALF-OPEN`);
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

    if (this.state === 'half-open') {
      this.successes++;
      
      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
        logger.info(`Circuit breaker '${this.name}' closed after successful recovery`);
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.timeout;
      
      logger.error(`Circuit breaker '${this.name}' opened`, {
        failures: this.failures,
        threshold: this.failureThreshold,
        nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    logger.info(`Circuit breaker '${this.name}' manually reset`);
  }
}
```

---

## 9. PII Sanitization

### 9.1 src/lib/utils/pii-sanitizer.ts (REQUIRED - Exact Implementation)

```typescript
export class PIISanitizer {
  private static readonly EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  private static readonly PHONE_REGEX = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  private static readonly SSN_REGEX = /\b\d{3}-?\d{2}-?\d{4}\b/g;

  /**
   * Sanitize a single value
   */
  static sanitizeValue(value: any, key?: string): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value, key);
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => this.sanitizeValue(item, key));
    }

    if (typeof value === 'object') {
      return this.sanitizeObject(value);
    }

    return value;
  }

  /**
   * Sanitize an object recursively
   */
  static sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = this.sanitizeValue(value, key);
    }

    return sanitized;
  }

  /**
   * Sanitize a string value
   */
  private static sanitizeString(value: string, key?: string): string {
    let sanitized = value;

    // Check key name for context
    const keyLower = key?.toLowerCase() || '';

    // Email sanitization
    if (keyLower.includes('email') || this.EMAIL_REGEX.test(value)) {
      sanitized = sanitized.replace(this.EMAIL_REGEX, '[REDACTED_EMAIL]');
    }

    // Phone number sanitization
    if (keyLower.includes('phone') || this.PHONE_REGEX.test(value)) {
      sanitized = sanitized.replace(this.PHONE_REGEX, '[REDACTED_PHONE]');
    }

    // SSN sanitization
    if (keyLower.includes('ssn') || keyLower.includes('social')) {
      sanitized = '[REDACTED_SSN]';
    } else {
      sanitized = sanitized.replace(this.SSN_REGEX, '[REDACTED_SSN]');
    }

    return sanitized;
  }

  /**
   * Check if a value contains PII
   */
  static containsPII(value: any): boolean {
    if (typeof value === 'string') {
      return (
        this.EMAIL_REGEX.test(value) ||
        this.PHONE_REGEX.test(value) ||
        this.SSN_REGEX.test(value)
      );
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.containsPII(item));
    }

    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some((v) => this.containsPII(v));
    }

    return false;
  }
}
```

---

## 10. Prometheus Metrics

### 10.1 src/lib/utils/metrics.ts (REQUIRED - Exact Implementation)

```typescript
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export const register = new Registry();

// Incidents detected counter
export const incidentsDetected = new Counter({
  name: 'incidents_detected_total',
  help: 'Total number of incidents detected',
  labelNames: ['monitor_id', 'severity', 'tier'],
  registers: [register],
});

// Analysis duration histogram
export const analysisDuration = new Histogram({
  name: 'analysis_duration_seconds',
  help: 'Duration of incident analysis',
  labelNames: ['monitor_id', 'tier', 'success'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

// Investigation duration histogram
export const investigationDuration = new Histogram({
  name: 'investigation_duration_seconds',
  help: 'Duration of incident investigation',
  labelNames: ['monitor_id', 'tier'],
  buckets: [1, 5, 10, 15, 30, 60],
  registers: [register],
});

// LLM token usage counter
export const llmTokens = new Counter({
  name: 'llm_tokens_total',
  help: 'Total LLM tokens used',
  labelNames: ['type'], // 'input' or 'output'
  registers: [register],
});

// External API calls counter
export const externalApiCalls = new Counter({
  name: 'external_api_calls_total',
  help: 'Total external API calls',
  labelNames: ['service', 'status'], // service: datadog, gitlab, etc.
  registers: [register],
});

// External API duration histogram
export const externalApiDuration = new Histogram({
  name: 'external_api_duration_seconds',
  help: 'Duration of external API calls',
  labelNames: ['service', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Active incidents gauge
export const activeIncidents = new Gauge({
  name: 'active_incidents',
  help: 'Number of currently active incidents',
  registers: [register],
});

// Circuit breaker state gauge
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'],
  registers: [register],
});

// Cache hit rate counter
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type'], // baseline, metrics, llm, etc.
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

// API request duration
export const apiRequestDuration = new Histogram({
  name: 'api_request_duration_seconds',
  help: 'API request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Investigation tier usage counter
export const investigationTierUsed = new Counter({
  name: 'investigation_tier_used_total',
  help: 'Investigation tier usage count',
  labelNames: ['tier'], // tier1, tier2, tier3
  registers: [register],
});

// Helper function to update circuit breaker state metric
export function updateCircuitBreakerState(service: string, state: 'closed' | 'open' | 'half-open') {
  const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
  circuitBreakerState.set({ service }, stateValue);
}
```

---

## 11. Application Entry Point

### 11.1 src/index.ts (REQUIRED - Bootstrap Code)

```typescript
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

import { config } from './config';
import { logger } from './lib/utils/logger';
import { startServer } from './server';

async function bootstrap() {
  try {
    logger.info('Starting Incident Response Platform', {
      version: process.env.APP_VERSION || '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    });

    // Start HTTP server
    await startServer();

    logger.info('Platform started successfully', {
      port: config.server.port,
    });
  } catch (error) {
    logger.error('Failed to start platform', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise,
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the application
bootstrap();
```

### 11.2 src/server.ts (STUB - Will be completed in later docs)

```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { logger } from './lib/utils/logger';
import { register as metricsRegister } from './lib/utils/metrics';

export async function startServer() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  });

  // TODO: Add API routes (will be added in document 05)

  // Start server
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(config.server.port, () => {
      logger.info(`Server listening on port ${config.server.port}`);
      resolve();
    });

    server.on('error', reject);
  });
}
```

---

## 12. Environment Variables

### 12.1 .env.example (REQUIRED - Template for Users)

```bash
# Server Configuration
PORT=3000
LOG_LEVEL=info
NODE_ENV=development
APP_VERSION=1.0.0

# Datadog Configuration
DATADOG_API_KEY=your-datadog-api-key
DATADOG_APP_KEY=your-datadog-app-key
DATADOG_SITE=datadoghq.com
DATADOG_ERROR_TRACKING_ENABLED=true
DATADOG_DEPLOYMENT_TRACKING_ENABLED=false

# GitLab Configuration
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your-gitlab-token

# Google Gemini Configuration
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-1.5-pro
GEMINI_MAX_TOKENS=4000
GEMINI_TEMPERATURE=0.2

# MS Teams Configuration
MS_TEAMS_TENANT_ID=your-tenant-id
MS_TEAMS_CLIENT_ID=your-client-id
MS_TEAMS_CLIENT_SECRET=your-client-secret
MS_TEAMS_DEFAULT_WEBHOOK=https://outlook.office.com/webhook/...

# Database Configuration
DB_HOST=localhost
DB_PORT=1433
DB_NAME=incident_response
DB_USERNAME=sa
DB_PASSWORD=your-database-password
DB_INVESTIGATION_ENABLED=true
DB_INVESTIGATION_TIMEOUT=10
DB_INVESTIGATION_MAX_ROWS=100
DB_INVESTIGATION_AUDIT=true

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TTL_BASELINE=86400
REDIS_TTL_METRICS=300
REDIS_TTL_REPO_METADATA=3600
REDIS_TTL_LLM=3600

# Sourcegraph Configuration
SOURCEGRAPH_URL=https://sourcegraph.com
SOURCEGRAPH_TOKEN=your-sourcegraph-token
SOURCEGRAPH_MAX_RESULTS=10

# Web Search Configuration (Optional)
WEB_SEARCH_ENABLED=false
WEB_SEARCH_PROVIDER=duckduckgo
WEB_SEARCH_MAX_SEARCHES=3

# Monitoring Configuration
MONITORS_CONFIG_PATH=./config/monitors.json
MONITORS_HOT_RELOAD=true
```

---

## 13. Implementation Notes for Claude Code

### 13.1 What to Generate

Claude Code should generate:

1. ✅ Complete directory structure as specified
2. ✅ All configuration files (package.json, tsconfig.json, etc.)
3. ✅ All type definition files in `src/lib/types/`
4. ✅ Configuration management in `src/config/`
5. ✅ All utility files in `src/lib/utils/`
6. ✅ Application bootstrap in `src/index.ts`
7. ✅ Basic server setup in `src/server.ts`
8. ✅ Environment template `.env.example`

### 13.2 What NOT to Generate Yet

The following will be specified in subsequent documents:

- ❌ Client implementations (`src/lib/clients/`)
- ❌ Service implementations (`src/services/`)
- ❌ API routes and controllers (`src/api/`)
- ❌ LangGraph workflow (`src/workflows/`)
- ❌ Test files (structure only, no implementations yet)
- ❌ Database migrations
- ❌ Kubernetes manifests
- ❌ Docker configuration

### 13.3 Coding Standards

When generating code:

1. **TypeScript Strict Mode**: All code must compile with strict type checking
2. **No `any` Types**: Use proper typing or `unknown` with type guards
3. **Error Handling**: All async operations must handle errors
4. **Logging**: Use the logger utility for all logging
5. **Comments**: Add JSDoc comments for all exported functions/classes
6. **Naming**: Use camelCase for variables/functions, PascalCase for classes/types
7. **Imports**: Use absolute imports where possible, organize by external/internal

### 13.4 Testing Setup

Create basic test setup:

**tests/setup.ts:**
```typescript
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Add any global test setup here
beforeAll(async () => {
  // Global setup
});

afterAll(async () => {
  // Global teardown
});
```

**tests/unit/lib/utils/logger.test.ts (EXAMPLE):**
```typescript
import { logger } from '../../../../src/lib/utils/logger';

describe('Logger', () => {
  it('should create logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeInstanceOf(Function);
  });

  it('should create child logger with correlation ID', () => {
    const childLogger = logger.child({ correlationId: 'test-123' });
    expect(childLogger).toBeDefined();
  });
});
```

---

## 14. Next Steps

After Claude Code generates this foundation:

1. **Document 02**: Detection Service implementation
2. **Document 03**: Investigation Service implementation  
3. **Document 04**: Analysis Service + LangGraph workflow
4. **Document 05**: Notification Service + REST API
5. **Document 06**: Deployment configuration + testing strategy

Each subsequent document will build on this foundation, adding:
- Client implementations
- Service logic
- Workflow orchestration
- API endpoints
- Tests
- Deployment configs

---

## 15. Validation Checklist

After generation, verify:

- ✅ `pnpm install` runs without errors
- ✅ `pnpm run typecheck` passes
- ✅ `pnpm run lint` passes
- ✅ `pnpm run test` runs (even if no tests yet)
- ✅ `pnpm run build` produces dist/ directory
- ✅ Configuration loads from .env and config file
- ✅ Logger outputs properly formatted logs
- ✅ Metrics endpoint returns Prometheus format

---

**End of Document 01**

This document provides the complete foundation for the platform. Claude Code should use this as a precise blueprint for generating the initial project structure and core infrastructure.
