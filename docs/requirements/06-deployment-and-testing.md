# Requirements Document 06: Deployment & Testing
## AI-Powered Incident Response Platform - Claude Code Implementation Guide

**Version:** 1.0  
**Date:** January 14, 2026  
**Purpose:** Docker, Kubernetes, CI/CD, and testing infrastructure

---

## Overview

This document provides requirements for deployment configuration, CI/CD pipelines, database migrations, and comprehensive testing infrastructure.

**Dependencies:** Documents 01-05 must be completed first.

---

## 1. Docker Configuration

### 1.1 Dockerfile (REQUIRED - Multi-stage Build)

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm@8 && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# Production stage
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN npm install -g pnpm@8 && \
    pnpm install --frozen-lockfile --prod && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config

# Change ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]
```

### 1.2 .dockerignore (REQUIRED)

```
node_modules
dist
.git
.env
.env.*
*.log
coverage
.vscode
.idea
*.md
tests
```

---

## 2. Kubernetes Manifests

### 2.1 k8s/deployment.yaml (REQUIRED)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: incident-response-platform
  labels:
    app: incident-response
spec:
  replicas: 1
  selector:
    matchLabels:
      app: incident-response
  template:
    metadata:
      labels:
        app: incident-response
    spec:
      serviceAccountName: incident-response
      containers:
      - name: incident-response
        image: <REGISTRY>/incident-response-platform:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        envFrom:
        - configMapRef:
            name: incident-response-config
        - secretRef:
            name: incident-response-secrets
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: incident-response
```

### 2.2 k8s/service.yaml (REQUIRED)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: incident-response
  labels:
    app: incident-response
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  selector:
    app: incident-response
---
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: incident-response
spec:
  to:
    kind: Service
    name: incident-response
  port:
    targetPort: http
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
```

### 2.3 k8s/configmap.yaml (REQUIRED)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: incident-response-config
data:
  LOG_LEVEL: "info"
  DATADOG_SITE: "datadoghq.com"
  DATADOG_ERROR_TRACKING_ENABLED: "true"
  DATADOG_DEPLOYMENT_TRACKING_ENABLED: "false"
  GITLAB_URL: "https://gitlab.com"
  SOURCEGRAPH_URL: "https://sourcegraph.com"
  SOURCEGRAPH_MAX_RESULTS: "10"
  WEB_SEARCH_ENABLED: "false"
  MONITORS_CONFIG_PATH: "./config/monitors.json"
  MONITORS_HOT_RELOAD: "true"
  REDIS_TTL_BASELINE: "86400"
  REDIS_TTL_METRICS: "300"
  REDIS_TTL_REPO_METADATA: "3600"
  REDIS_TTL_LLM: "3600"
  DB_INVESTIGATION_ENABLED: "true"
  DB_INVESTIGATION_TIMEOUT: "10"
  DB_INVESTIGATION_MAX_ROWS: "100"
  DB_INVESTIGATION_AUDIT: "true"
```

### 2.4 k8s/secret.yaml.example (TEMPLATE)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: incident-response-secrets
type: Opaque
stringData:
  DATADOG_API_KEY: "<your-datadog-api-key>"
  DATADOG_APP_KEY: "<your-datadog-app-key>"
  GITLAB_TOKEN: "<your-gitlab-token>"
  GEMINI_API_KEY: "<your-gemini-api-key>"
  MS_TEAMS_TENANT_ID: "<your-tenant-id>"
  MS_TEAMS_CLIENT_ID: "<your-client-id>"
  MS_TEAMS_CLIENT_SECRET: "<your-client-secret>"
  DB_HOST: "<database-host>"
  DB_PORT: "1433"
  DB_NAME: "<database-name>"
  DB_USERNAME: "<database-username>"
  DB_PASSWORD: "<database-password>"
  REDIS_HOST: "<redis-host>"
  REDIS_PORT: "6379"
  REDIS_PASSWORD: "<redis-password>"
  SOURCEGRAPH_TOKEN: "<your-sourcegraph-token>"
```

### 2.5 k8s/redis.yaml (REQUIRED)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  labels:
    app: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
          name: redis
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          tcpSocket:
            port: 6379
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  labels:
    app: redis
spec:
  type: ClusterIP
  ports:
  - port: 6379
    targetPort: 6379
    protocol: TCP
    name: redis
  selector:
    app: redis
```

---

## 3. Database Migrations

### 3.1 scripts/migrate-db.ts (REQUIRED)

```typescript
import sql from 'mssql';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../src/config';
import { logger } from '../src/lib/utils/logger';

async function migrate() {
  try {
    logger.info('Starting database migration');

    const dbConfig: sql.config = {
      server: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      options: {
        encrypt: true,
        trustServerCertificate: false,
      },
    };

    const pool = await sql.connect(dbConfig);
    logger.info('Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/001_initial_schema.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    // Split by GO statements
    const statements = migrationSQL
      .split(/^\s*GO\s*$/gim)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    logger.info(`Executing ${statements.length} migration statements`);

    for (const [index, statement] of statements.entries()) {
      try {
        await pool.request().query(statement);
        logger.info(`Executed statement ${index + 1}/${statements.length}`);
      } catch (error) {
        logger.error(`Failed to execute statement ${index + 1}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    await pool.close();
    logger.info('Database migration completed successfully');
  } catch (error) {
    logger.error('Database migration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

migrate();
```

### 3.2 migrations/001_initial_schema.sql (REQUIRED)

```sql
-- Incidents table
CREATE TABLE incidents (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  external_id NVARCHAR(255) UNIQUE NOT NULL,
  monitor_id NVARCHAR(255) NOT NULL,
  service_name NVARCHAR(255) NOT NULL,
  severity NVARCHAR(50) NOT NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'active',
  investigation_tier NVARCHAR(20),
  
  metric_name NVARCHAR(255) NOT NULL,
  metric_value FLOAT,
  baseline_value FLOAT,
  threshold_value FLOAT NOT NULL,
  deviation_percentage FLOAT,
  error_message NVARCHAR(MAX),
  stack_trace NVARCHAR(MAX),
  
  analysis_result NVARCHAR(MAX),
  
  detected_at DATETIME2 NOT NULL,
  resolved_at DATETIME2,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  
  tags NVARCHAR(MAX) DEFAULT '[]',
  
  INDEX idx_incidents_monitor_id (monitor_id),
  INDEX idx_incidents_service_name (service_name),
  INDEX idx_incidents_status (status),
  INDEX idx_incidents_detected_at (detected_at DESC)
);
GO

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
  source NVARCHAR(50) NOT NULL,
  evidence_data NVARCHAR(MAX) NOT NULL,
  confidence_score DECIMAL(3, 2),
  relevance_score DECIMAL(3, 2),
  collected_at DATETIME2 DEFAULT GETDATE(),
  
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_evidence_incident_id (incident_id),
  INDEX idx_evidence_source (source)
);
GO

-- API keys table
CREATE TABLE api_keys (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  key_hash NVARCHAR(64) UNIQUE NOT NULL,
  name NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  created_by NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
  last_used_at DATETIME2,
  expires_at DATETIME2,
  is_active BIT DEFAULT 1,
  
  INDEX idx_api_keys_key_hash (key_hash)
);
GO

-- LLM usage tracking table
CREATE TABLE llm_usage (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  incident_id UNIQUEIDENTIFIER,
  
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  total_tokens AS (input_tokens + output_tokens) PERSISTED,
  
  model_name NVARCHAR(255) NOT NULL,
  request_duration_ms INT,
  estimated_cost_usd DECIMAL(10, 6),
  
  created_at DATETIME2 DEFAULT GETDATE(),
  
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  INDEX idx_llm_usage_incident_id (incident_id),
  INDEX idx_llm_usage_created_at (created_at DESC)
);
GO
```

---

## 4. GitLab CI/CD Pipeline

### 4.1 .gitlab-ci.yml (REQUIRED)

```yaml
stages:
  - lint
  - test
  - build
  - scan
  - deploy

variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
  DOCKER_LATEST: $CI_REGISTRY_IMAGE:latest

# Lint stage
lint:
  stage: lint
  image: node:20-alpine
  before_script:
    - npm install -g pnpm@8
    - pnpm install --frozen-lockfile
  script:
    - pnpm run lint
    - pnpm run typecheck
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/
      - .pnpm-store/

# Test stage
test:unit:
  stage: test
  image: node:20-alpine
  before_script:
    - npm install -g pnpm@8
    - pnpm install --frozen-lockfile
  script:
    - pnpm run test:unit
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/
      - .pnpm-store/

test:integration:
  stage: test
  image: node:20-alpine
  services:
    - redis:7-alpine
    - mcr.microsoft.com/mssql/server:2022-latest
  variables:
    REDIS_HOST: redis
    DB_HOST: mssql
    ACCEPT_EULA: "Y"
    SA_PASSWORD: "TestPassword123!"
  before_script:
    - npm install -g pnpm@8
    - pnpm install --frozen-lockfile
  script:
    - pnpm run test:integration
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/
      - .pnpm-store/

# Build stage
build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $DOCKER_IMAGE -t $DOCKER_LATEST .
    - docker push $DOCKER_IMAGE
    - docker push $DOCKER_LATEST
  only:
    - main
    - tags

# Security scan stage
scan:trivy:
  stage: scan
  image: aquasec/trivy:latest
  script:
    - trivy image --severity HIGH,CRITICAL --exit-code 1 $DOCKER_IMAGE
  only:
    - main
    - tags
  allow_failure: true

# Deploy stage (manual)
deploy:production:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl config set-cluster k8s --server="$KUBE_SERVER" --insecure-skip-tls-verify=true
    - kubectl config set-credentials deployer --token="$KUBE_TOKEN"
    - kubectl config set-context default --cluster=k8s --user=deployer
    - kubectl config use-context default
    - kubectl set image deployment/incident-response-platform incident-response=$DOCKER_IMAGE
    - kubectl rollout status deployment/incident-response-platform
  only:
    - main
  when: manual
  environment:
    name: production
```

---

## 5. Testing Infrastructure

### 5.1 Test Setup Files

**tests/setup.ts:**

```typescript
import dotenv from 'dotenv';
import path from 'path';

// Load test environment
dotenv.config({ path: path.join(__dirname, '../.env.test') });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global test teardown
});
```

**tests/fixtures/incidents.ts:**

```typescript
import type { Incident } from '../../src/lib/types/incident';

export const mockIncident: Incident = {
  id: 'test-incident-1',
  externalId: 'INC-12345',
  monitorId: 'test-monitor',
  serviceName: 'api-service',
  severity: 'critical',
  status: 'active',
  investigationTier: 'tier3',
  metricName: 'error_rate',
  metricValue: 150,
  baselineValue: 10,
  thresholdValue: 50,
  deviationPercentage: 1400,
  errorMessage: 'Database connection failed',
  stackTrace: 'Error: Connection timeout\n  at Database.connect',
  detectedAt: new Date('2026-01-14T10:00:00Z'),
  createdAt: new Date('2026-01-14T10:00:00Z'),
  updatedAt: new Date('2026-01-14T10:00:00Z'),
  tags: ['database', 'api'],
};

export const mockMonitorConfig = {
  id: 'test-monitor',
  name: 'Test Monitor',
  description: 'Test monitor config',
  enabled: true,
  queries: {
    metric: 'sum:error.rate{service:api}',
    errorTracking: 'service:api status:error',
  },
  checkIntervalSeconds: 60,
  threshold: {
    type: 'absolute' as const,
    warning: 25,
    critical: 50,
  },
  timeWindow: '5m',
  gitlabRepositories: ['test/repo'],
  enableDatabaseInvestigation: false,
  teamsNotification: {
    channelWebhookUrl: 'https://example.com/webhook',
  },
  tags: ['test'],
  severity: 'critical' as const,
};
```

### 5.2 Integration Test Examples

**tests/integration/services/detection/DetectionService.integration.test.ts:**

```typescript
import { DetectionService } from '../../../../src/services/detection';
import { DatabaseClient } from '../../../../src/lib/clients/database';
import { RedisClient } from '../../../../src/lib/clients/redis';

describe('DetectionService Integration', () => {
  let service: DetectionService;
  let database: DatabaseClient;
  let redis: RedisClient;

  beforeAll(async () => {
    database = new DatabaseClient();
    await database.connect();
    
    redis = new RedisClient();
    await redis.connect();

    service = new DetectionService();
  });

  afterAll(async () => {
    await database.disconnect();
    await redis.disconnect();
  });

  it('should start and stop without errors', async () => {
    await expect(service.start()).resolves.not.toThrow();
    await expect(service.stop()).resolves.not.toThrow();
  }, 30000);
});
```

### 5.3 E2E Test Example

**tests/e2e/incident-workflow.test.ts:**

```typescript
import supertest from 'supertest';
import { startServer } from '../../src/server';

describe('End-to-End Incident Workflow', () => {
  let app: any;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    app = await startServer();
    request = supertest(app);
  });

  it('should complete full incident workflow', async () => {
    // 1. Health check
    const healthResponse = await request.get('/health');
    expect(healthResponse.status).toBe(200);

    // 2. List incidents
    const incidentsResponse = await request
      .get('/api/v1/incidents')
      .set('X-API-Key', 'test-api-key');
    expect(incidentsResponse.status).toBe(200);

    // 3. Verify metrics
    const metricsResponse = await request.get('/metrics');
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain('incidents_detected_total');
  }, 60000);
});
```

---

## 6. Scripts

### 6.1 scripts/generate-api-key.ts (REQUIRED)

```typescript
import crypto from 'crypto';
import { logger } from '../src/lib/utils/logger';

function generateApiKey(): string {
  return 'irp_' + crypto.randomBytes(32).toString('hex');
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

const apiKey = generateApiKey();
const hash = hashApiKey(apiKey);

logger.info('Generated API Key', {
  apiKey,
  hash,
});

console.log('\n=== API Key Generated ===');
console.log('API Key:', apiKey);
console.log('Hash (for database):', hash);
console.log('\nStore the API key securely. The hash should be stored in the database.');
```

---

## 7. Documentation

### 7.1 README.md Updates (ADD TO EXISTING)

Add deployment section:

```markdown
## Deployment

### Prerequisites

- Kubernetes cluster (ARO or generic)
- Docker registry access
- MS SQL Server instance
- Redis instance

### Steps

1. **Build Docker image:**
   ```bash
   docker build -t incident-response-platform:latest .
   ```

2. **Create Kubernetes secrets:**
   ```bash
   kubectl create secret generic incident-response-secrets \
     --from-literal=DATADOG_API_KEY=xxx \
     --from-literal=GITLAB_TOKEN=xxx \
     # ... other secrets
   ```

3. **Deploy to Kubernetes:**
   ```bash
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/redis.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   ```

4. **Run database migrations:**
   ```bash
   pnpm run migrate
   ```

5. **Verify deployment:**
   ```bash
   kubectl get pods
   kubectl logs -f deployment/incident-response-platform
   ```

### Environment Variables

See `.env.example` for all required environment variables.

### Monitoring

- Health: `GET /health`
- Metrics: `GET /metrics` (Prometheus format)
```

---

## 8. Implementation Checklist

After Claude Code generates:

- ✅ Multi-stage Dockerfile with health check
- ✅ Kubernetes manifests (Deployment, Service, ConfigMap, Secret template, Redis)
- ✅ Database migration script and SQL schema
- ✅ GitLab CI/CD pipeline (lint, test, build, scan, deploy)
- ✅ Test setup and fixtures
- ✅ Integration test examples
- ✅ E2E test example
- ✅ API key generation script
- ✅ Deployment documentation

---

## 9. Final Validation Steps

After complete generation:

1. **Build and test locally:**
   ```bash
   pnpm install
   pnpm run lint
   pnpm run typecheck
   pnpm run test
   pnpm run build
   ```

2. **Build Docker image:**
   ```bash
   docker build -t incident-response-platform:latest .
   docker run -p 3000:3000 incident-response-platform:latest
   ```

3. **Run migrations:**
   ```bash
   pnpm run migrate
   ```

4. **Deploy to test environment:**
   ```bash
   kubectl apply -f k8s/
   ```

5. **Verify all services:**
   - Health check responds
   - Metrics endpoint works
   - Monitors load successfully
   - Detection service starts
   - API endpoints respond

---

**End of Document 06**

## Complete Implementation Package

All 6 requirements documents are now complete:

1. ✅ **Foundation & Setup** - Project structure, types, utilities, configuration
2. ✅ **Detection Service** - Datadog integration, anomaly detection, monitoring
3. ✅ **Investigation Service** - GitLab, Sourcegraph, Database investigation
4. ✅ **Analysis Service** - Gemini LLM, LangGraph workflow, prompt engineering
5. ✅ **Notification & API** - MS Teams, REST API, complete database operations
6. ✅ **Deployment & Testing** - Docker, Kubernetes, CI/CD, testing infrastructure

**Total: ~16,500 lines of production-ready code specifications**

Ready for Claude Code implementation!
