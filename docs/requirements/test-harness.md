# Stub Services Design Document
## Integration Testing Harness for Incident Response Platform

**Version:** 1.0  
**Date:** January 18, 2026  
**Purpose:** Enable local development and integration testing without external dependencies

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Scenario Definitions](#scenario-definitions)
4. [API Endpoints](#api-endpoints)
5. [Implementation Guide](#implementation-guide)
6. [Usage Examples](#usage-examples)

---

## Overview

### Purpose

Provide a **single, lightweight service** that mocks all external dependencies (Datadog, GitLab, Sourcegraph, MS SQL Server) to enable:

- Local development without VPN or production credentials
- Integration testing of the investigation pipeline
- Verification that all components connect and coordinate correctly
- Basic end-to-end workflow validation

### Non-Goals

- Comprehensive test coverage of all edge cases
- Realistic performance characteristics
- Production-like data volumes
- Multiple concurrent scenarios
- Stateful scenario progression

### Design Principles

- **Simplicity:** Single service, minimal configuration
- **Predictability:** Static, canned responses that tell a coherent story
- **Practicality:** Just enough realism to validate integration
- **Maintainability:** Easy to understand and modify

---

## Architecture

### Single Service Approach

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              Stub Service (Port 3100)                   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Datadog    │  │   GitLab     │  │ Sourcegraph  │ │
│  │   Routes     │  │   Routes     │  │   Routes     │ │
│  │  /datadog/*  │  │  /gitlab/*   │  │/sourcegraph/*│ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │           MS SQL Server Protocol Stub            │  │
│  │              (TDS Protocol - Port 1433)          │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Scenario Data (JSON files)            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Runtime:** Node.js 20 (TypeScript)
- **Web Framework:** Express.js
- **SQL Protocol:** `tedious` (for TDS protocol mock)
- **Data Storage:** Static JSON files
- **Container:** Docker

### Port Assignments

- **HTTP APIs:** Port 3100 (Datadog, GitLab, Sourcegraph)
- **SQL Server:** Port 1433 (TDS protocol)

### Configuration

```typescript
interface StubConfig {
  scenario: 'missing-db-column' | 'config-typo';
  baseTimestamp: string; // ISO 8601
  httpPort: number;      // Default: 3100
  sqlPort: number;       // Default: 1433
}
```

Environment variables:
```bash
SCENARIO=missing-db-column
BASE_TIMESTAMP=2026-01-09T10:00:00Z
HTTP_PORT=3100
SQL_PORT=1433
```

---

## Scenario Definitions

### Scenario 1: Missing Database Column (Primary)

**Story:** Database migration renamed `email` to `EmailAddress`, but code still references old column name.

**Timeline:**
- **T+0 min** (10:00 AM): Migration deployed (commit abc123)
- **T+15 min** (10:15 AM): First errors appear
- **T+30 min** (10:30 AM): Error rate crosses threshold (when detection service queries)

**Key Actors:**
- Commit author: jane.doe@company.com
- Commit SHA: abc123def456789012345678901234567890abcd
- Service: api-service
- Repository: myorg/api-service

**Expected Platform Behavior:**
- Detection service sees error rate spike at 10:30 AM
- Investigation service finds:
  - Datadog: Stack trace pointing to UserController.ts:145
  - GitLab: Commit abc123 from 10:00 AM showing column rename
  - Database: Column 'email' missing, 'EmailAddress' exists
  - Sourcegraph: 127 references to 'user.email' across codebase
- Analysis service (Claude) identifies root cause with high confidence
- Notification sent to Slack with actionable recommendations

---

### Scenario 2: Configuration Typo (Secondary)

**Story:** Config file typo breaks database connection.

**Timeline:**
- **T+0 min**: Config change deployed (commit def456)
- **T+5 min**: 500 errors start appearing
- **T+10 min**: Error rate crosses threshold

**Key Actors:**
- Commit author: bob.smith@company.com
- Commit SHA: def456abc789012345678901234567890abcdef
- Service: api-service
- Repository: myorg/api-service

**Expected Platform Behavior:**
- Detection service sees 500 error spike
- Investigation finds typo: "databseUrl" instead of "databaseUrl"
- Analysis identifies simple typo with high confidence
- Notification suggests config rollback

---

## API Endpoints

### Datadog Mock API

**Base Path:** `/datadog/api`

#### 1. Metrics Query
```
POST /datadog/api/v1/query
```

**Request:**
```json
{
  "query": "sum:trace.http.request.errors{service:api-service,http.status_code:5*}.as_rate()",
  "from": 1704794400,
  "to": 1704796200
}
```

**Response (Scenario 1 - after T+30):**
```json
{
  "status": "ok",
  "series": [
    {
      "metric": "trace.http.request.errors",
      "points": [
        [1704794400000, 2.0],    // 10:00 - baseline
        [1704795000000, 2.1],    // 10:10 - baseline
        [1704795600000, 2.0],    // 10:20 - baseline
        [1704796200000, 47.3]    // 10:30 - anomaly!
      ],
      "scope": "service:api-service,http.status_code:5*",
      "tag_set": ["service:api-service", "http.status_code:5xx"]
    }
  ]
}
```

#### 2. Log Search
```
POST /datadog/api/v2/logs/events/search
```

**Request:**
```json
{
  "filter": {
    "query": "service:api-service status:error",
    "from": "2026-01-09T10:15:00Z",
    "to": "2026-01-09T10:35:00Z"
  }
}
```

**Response (Scenario 1):**
```json
{
  "data": [
    {
      "id": "log-001",
      "attributes": {
        "timestamp": "2026-01-09T10:15:23Z",
        "message": "TypeError: Cannot read property 'email' of undefined",
        "service": "api-service",
        "status": "error",
        "attributes": {
          "error.stack": "TypeError: Cannot read property 'email' of undefined\n    at UserController.getProfile (UserController.ts:145:28)\n    at Layer.handle [as handle_request] (express/lib/router/layer.js:95:5)",
          "error.kind": "TypeError",
          "http.status_code": 500,
          "http.url": "/api/users/profile",
          "http.method": "GET"
        }
      }
    },
    {
      "id": "log-002",
      "attributes": {
        "timestamp": "2026-01-09T10:16:45Z",
        "message": "TypeError: Cannot read property 'email' of undefined",
        "service": "api-service",
        "status": "error",
        "attributes": {
          "error.stack": "TypeError: Cannot read property 'email' of undefined\n    at UserController.getProfile (UserController.ts:145:28)\n    at Layer.handle [as handle_request] (express/lib/router/layer.js:95:5)",
          "error.kind": "TypeError",
          "http.status_code": 500
        }
      }
    }
  ],
  "meta": {
    "page": {
      "total_count": 2
    }
  }
}
```

#### 3. Deployment Events
```
GET /datadog/api/v2/events?filter[query]=service:api-service type:deployment
```

**Response (Scenario 1):**
```json
{
  "data": [
    {
      "id": "evt-001",
      "type": "event",
      "attributes": {
        "timestamp": "2026-01-09T10:00:00Z",
        "title": "Deployment: api-service v2.3.1",
        "text": "Deployed commit abc123def456789012345678901234567890abcd",
        "tags": [
          "service:api-service",
          "version:2.3.1",
          "git.commit.sha:abc123def456789012345678901234567890abcd",
          "git.repository.url:https://gitlab.company.com/myorg/api-service"
        ],
        "alert_type": "info"
      }
    }
  ]
}
```

---

### GitLab Mock API

**Base Path:** `/gitlab/api/v4`

#### 1. Get Recent Commits
```
GET /gitlab/api/v4/projects/:id/repository/commits?since=2026-01-09T09:00:00Z
```

**Response (Scenario 1):**
```json
[
  {
    "id": "abc123def456789012345678901234567890abcd",
    "short_id": "abc123d",
    "title": "Refactor: Rename email column to EmailAddress",
    "message": "Refactor: Rename email column to EmailAddress\n\nUpdating database schema for better naming consistency.\nMigration updates Users table column name.",
    "author_name": "Jane Doe",
    "author_email": "jane.doe@company.com",
    "authored_date": "2026-01-09T09:45:00Z",
    "committer_name": "Jane Doe",
    "committer_email": "jane.doe@company.com",
    "committed_date": "2026-01-09T09:45:00Z",
    "created_at": "2026-01-09T09:45:00Z",
    "web_url": "https://gitlab.company.com/myorg/api-service/-/commit/abc123def456789012345678901234567890abcd",
    "stats": {
      "additions": 12,
      "deletions": 8,
      "total": 20
    }
  },
  {
    "id": "def456abc789012345678901234567890abcdef01",
    "short_id": "def456a",
    "title": "Fix: Update logging format",
    "message": "Fix: Update logging format\n\nStandardize log output across services.",
    "author_name": "Bob Smith",
    "author_email": "bob.smith@company.com",
    "authored_date": "2026-01-08T14:30:00Z",
    "committed_date": "2026-01-08T14:30:00Z",
    "created_at": "2026-01-08T14:30:00Z",
    "web_url": "https://gitlab.company.com/myorg/api-service/-/commit/def456abc789012345678901234567890abcdef01",
    "stats": {
      "additions": 5,
      "deletions": 3,
      "total": 8
    }
  }
]
```

#### 2. Get Commit Diff
```
GET /gitlab/api/v4/projects/:id/repository/commits/abc123def456789012345678901234567890abcd/diff
```

**Response (Scenario 1):**
```json
[
  {
    "diff": "@@ -1,15 +1,15 @@\n-- Migration: Rename email column\n-- Date: 2026-01-09\n \nALTER TABLE Users\n-DROP COLUMN email;\n+DROP COLUMN email;\n \nALTER TABLE Users\n-ADD EmailAddress NVARCHAR(255) NOT NULL;\n+ADD EmailAddress NVARCHAR(255) NOT NULL;\n \n-- Migrate existing data (if any)\n-- UPDATE Users SET EmailAddress = email; (already executed)\n",
    "new_path": "migrations/20260109_rename_email_column.sql",
    "old_path": "migrations/20260109_rename_email_column.sql",
    "a_mode": "100644",
    "b_mode": "100644",
    "new_file": true,
    "renamed_file": false,
    "deleted_file": false
  },
  {
    "diff": "@@ -142,7 +142,7 @@ export class UserController {\n   async getProfile(req: Request, res: Response) {\n     try {\n       const user = await this.userService.findById(req.userId);\n-      \n+      // Note: Database column renamed to EmailAddress\n       return res.json({\n         id: user.id,\n         name: user.name,",
    "new_path": "src/controllers/UserController.ts",
    "old_path": "src/controllers/UserController.ts",
    "a_mode": "100644",
    "b_mode": "100644",
    "new_file": false,
    "renamed_file": false,
    "deleted_file": false
  }
]
```

#### 3. Get File Content
```
GET /gitlab/api/v4/projects/:id/repository/files/src%2Fcontrollers%2FUserController.ts?ref=abc123def456789012345678901234567890abcd
```

**Response (Scenario 1):**
```json
{
  "file_name": "UserController.ts",
  "file_path": "src/controllers/UserController.ts",
  "size": 4521,
  "encoding": "base64",
  "content": "aW1wb3J0IHsgUmVxdWVzdCwgUmVzcG9uc2UgfSBmcm9tICdleHByZXNzJzsKaW1wb3J0IHsgVXNlclNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9Vc2VyU2VydmljZSc7CgpleHBvcnQgY2xhc3MgVXNlckNvbnRyb2xsZXIgewogIGNvbnN0cnVjdG9yKHByaXZhdGUgdXNlclNlcnZpY2U6IFVzZXJTZXJ2aWNlKSB7fQoKICBhc3luYyBnZXRQcm9maWxlKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgewogICAgdHJ5IHsKICAgICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMudXNlclNlcnZpY2UuZmluZEJ5SWQocmVxLnVzZXJJZCk7CiAgICAgIC8vIE5vdGU6IERhdGFiYXNlIGNvbHVtbiByZW5hbWVkIHRvIEVtYWlsQWRkcmVzcwogICAgICByZXR1cm4gcmVzLmpzb24oewogICAgICAgIGlkOiB1c2VyLmlkLAogICAgICAgIG5hbWU6IHVzZXIubmFtZSwKICAgICAgICBlbWFpbDogdXNlci5lbWFpbCwgIC8vIFRISVMgSVMgVEhFIFBST0JMRU0hCiAgICAgICAgY3JlYXRlZEF0OiB1c2VyLmNyZWF0ZWRBdAogICAgICB9KTsKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIHVzZXIgcHJvZmlsZTonLCBlcnJvcik7CiAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KTsKICAgIH0KICB9Cn0K",
  "content_sha256": "4c4a0b4e...",
  "ref": "abc123def456789012345678901234567890abcd",
  "blob_id": "blob123",
  "commit_id": "abc123def456789012345678901234567890abcd",
  "last_commit_id": "abc123def456789012345678901234567890abcd"
}
```

**Decoded content:**
```typescript
import { Request, Response } from 'express';
import { UserService } from '../services/UserService';

export class UserController {
  constructor(private userService: UserService) {}

  async getProfile(req: Request, res: Response) {
    try {
      const user = await this.userService.findById(req.userId);
      // Note: Database column renamed to EmailAddress
      return res.json({
        id: user.id,
        name: user.name,
        email: user.email,  // THIS IS THE PROBLEM!
        createdAt: user.createdAt
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

---

### Sourcegraph Mock API

**Base Path:** `/sourcegraph/.api`

#### 1. Code Search
```
POST /sourcegraph/.api/graphql
```

**Request:**
```json
{
  "query": "query($query: String!) { search(query: $query) { results { matchCount results { ... on FileMatch { file { path repository { name } } lineMatches { preview lineNumber } } } } } }",
  "variables": {
    "query": "user.email"
  }
}
```

**Response (Scenario 1):**
```json
{
  "data": {
    "search": {
      "results": {
        "matchCount": 127,
        "results": [
          {
            "__typename": "FileMatch",
            "file": {
              "path": "src/controllers/UserController.ts",
              "repository": {
                "name": "gitlab.company.com/myorg/api-service"
              }
            },
            "lineMatches": [
              {
                "preview": "        email: user.email,  // THIS IS THE PROBLEM!",
                "lineNumber": 145
              }
            ]
          },
          {
            "__typename": "FileMatch",
            "file": {
              "path": "src/services/EmailService.ts",
              "repository": {
                "name": "gitlab.company.com/myorg/api-service"
              }
            },
            "lineMatches": [
              {
                "preview": "    const email = user.email;",
                "lineNumber": 23
              },
              {
                "preview": "    await this.sendEmail(user.email, template);",
                "lineNumber": 45
              }
            ]
          },
          {
            "__typename": "FileMatch",
            "file": {
              "path": "src/models/User.ts",
              "repository": {
                "name": "gitlab.company.com/myorg/api-service"
              }
            },
            "lineMatches": [
              {
                "preview": "  email: string;",
                "lineNumber": 12
              }
            ]
          },
          {
            "__typename": "FileMatch",
            "file": {
              "path": "src/components/ProfileCard.tsx",
              "repository": {
                "name": "gitlab.company.com/myorg/mobile-app"
              }
            },
            "lineMatches": [
              {
                "preview": "      <Text>{user.email}</Text>",
                "lineNumber": 34
              }
            ]
          },
          {
            "__typename": "FileMatch",
            "file": {
              "path": "src/services/NotificationService.ts",
              "repository": {
                "name": "gitlab.company.com/myorg/notification-service"
              }
            },
            "lineMatches": [
              {
                "preview": "    to: user.email,",
                "lineNumber": 56
              }
            ]
          }
        ]
      }
    }
  }
}
```

#### 2. Recent Changes Search
```
POST /sourcegraph/.api/graphql
```

**Request:**
```json
{
  "query": "query($query: String!) { search(query: $query) { results { matchCount results { ... on CommitSearchResult { commit { oid message } } } } } }",
  "variables": {
    "query": "user.email type:diff after:\"7 days ago\""
  }
}
```

**Response (Scenario 1):**
```json
{
  "data": {
    "search": {
      "results": {
        "matchCount": 1,
        "results": [
          {
            "__typename": "CommitSearchResult",
            "commit": {
              "oid": "abc123def456789012345678901234567890abcd",
              "message": "Refactor: Rename email column to EmailAddress\n\nUpdating database schema for better naming consistency.\nMigration updates Users table column name."
            }
          }
        ]
      }
    }
  }
}
```

---

### MS SQL Server Mock

**Protocol:** TDS (Tabular Data Stream) on port 1433

**Implementation Strategy:**
- Use `tedious` library to implement minimal TDS protocol server
- Accept authentication (always succeed)
- Parse SQL queries
- Return canned results based on query patterns

#### Supported Queries

**1. Authentication:**
```sql
-- Any login succeeds
LOGIN: incident_agent_readonly / any_password
RESULT: Success
```

**2. Schema Query - Check if column exists:**
```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Users';
```

**Response (Scenario 1):**
```
COLUMN_NAME     | DATA_TYPE    | IS_NULLABLE
----------------|--------------|------------
UserId          | int          | NO
Name            | nvarchar     | NO
EmailAddress    | nvarchar     | NO
CreatedAt       | datetime     | NO
UpdatedAt       | datetime     | YES
```

**Note:** `email` column is missing!

**3. Find NULL values:**
```sql
SELECT TOP 100 * FROM Users WHERE Email IS NULL;
```

**Response (Scenario 1):**
```
ERROR: Invalid column name 'Email'.
```

**4. Missing Index Check:**
```sql
SELECT * FROM sys.dm_db_missing_index_details
WHERE database_id = DB_ID()
ORDER BY avg_total_user_cost * avg_user_impact DESC;
```

**Response (Scenario 1):**
```
[Empty result set - no missing indexes for this scenario]
```

**5. Slow Query Analysis:**
```sql
SELECT TOP 10 
  query_stats.query_hash,
  query_stats.total_elapsed_time / query_stats.execution_count AS avg_time,
  SUBSTRING(query_text.text, 1, 500) AS query
FROM sys.dm_exec_query_stats AS query_stats
CROSS APPLY sys.dm_exec_sql_text(query_stats.sql_handle) AS query_text
ORDER BY avg_time DESC;
```

**Response (Scenario 1):**
```
[Empty result set - no slow queries for this scenario]
```

**6. Recent DDL Changes (if auditing enabled):**
```sql
-- This would typically query audit tables
-- For stub, return empty or simple result
```

**Response (Scenario 1):**
```
event_time          | event_type   | object_name | statement
--------------------|--------------|-------------|------------------------------------------
2026-01-09 10:00:00 | ALTER_TABLE  | Users       | ALTER TABLE Users DROP COLUMN email;
2026-01-09 10:00:01 | ALTER_TABLE  | Users       | ALTER TABLE Users ADD EmailAddress NVARCHAR(255);
```

---

## Implementation Guide

### Project Structure

```
stub-service/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── config.ts                # Configuration loading
│   ├── scenarios/
│   │   ├── types.ts             # TypeScript interfaces
│   │   ├── missing-db-column.json
│   │   └── config-typo.json
│   ├── routes/
│   │   ├── datadog.ts           # Datadog API routes
│   │   ├── gitlab.ts            # GitLab API routes
│   │   └── sourcegraph.ts       # Sourcegraph API routes
│   ├── services/
│   │   └── sql-server.ts        # SQL Server TDS protocol mock
│   └── utils/
│       └── response-helpers.ts  # Common response utilities
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

### Core Implementation

#### index.ts

```typescript
import express from 'express';
import { loadConfig } from './config';
import { datadogRouter } from './routes/datadog';
import { gitlabRouter } from './routes/gitlab';
import { sourcegraphRouter } from './routes/sourcegraph';
import { startSqlServer } from './services/sql-server';

const config = loadConfig();

// HTTP API Server
const app = express();
app.use(express.json());

// Mount routers
app.use('/datadog/api', datadogRouter);
app.use('/gitlab/api', gitlabRouter);
app.use('/sourcegraph/.api', sourcegraphRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    scenario: config.scenario,
    timestamp: new Date().toISOString()
  });
});

// Start HTTP server
const httpServer = app.listen(config.httpPort, () => {
  console.log(`[Stub Service] HTTP API listening on port ${config.httpPort}`);
  console.log(`[Stub Service] Active scenario: ${config.scenario}`);
});

// Start SQL Server
startSqlServer(config.sqlPort, config.scenario);

process.on('SIGTERM', () => {
  console.log('[Stub Service] Shutting down...');
  httpServer.close();
  process.exit(0);
});
```

#### config.ts

```typescript
import fs from 'fs';
import path from 'path';

export interface StubConfig {
  scenario: string;
  baseTimestamp: Date;
  httpPort: number;
  sqlPort: number;
}

export function loadConfig(): StubConfig {
  const scenario = process.env.SCENARIO || 'missing-db-column';
  const baseTimestamp = new Date(process.env.BASE_TIMESTAMP || '2026-01-09T10:00:00Z');
  const httpPort = parseInt(process.env.HTTP_PORT || '3100');
  const sqlPort = parseInt(process.env.SQL_PORT || '1433');

  return {
    scenario,
    baseTimestamp,
    httpPort,
    sqlPort
  };
}

export function loadScenario(scenarioName: string): any {
  const scenarioPath = path.join(__dirname, 'scenarios', `${scenarioName}.json`);
  
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Scenario not found: ${scenarioName}`);
  }
  
  const data = fs.readFileSync(scenarioPath, 'utf-8');
  return JSON.parse(data);
}
```

#### routes/datadog.ts

```typescript
import { Router } from 'express';
import { loadConfig, loadScenario } from '../config';

export const datadogRouter = Router();

// Metrics query
datadogRouter.post('/v1/query', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  // Return scenario-specific metrics
  res.json(scenario.datadog.metrics);
});

// Log search
datadogRouter.post('/v2/logs/events/search', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  res.json(scenario.datadog.logs);
});

// Deployment events
datadogRouter.get('/v2/events', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  res.json(scenario.datadog.deployments);
});
```

#### routes/gitlab.ts

```typescript
import { Router } from 'express';
import { loadConfig, loadScenario } from '../config';

export const gitlabRouter = Router();

// Get commits
gitlabRouter.get('/v4/projects/:projectId/repository/commits', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  res.json(scenario.gitlab.commits);
});

// Get commit diff
gitlabRouter.get('/v4/projects/:projectId/repository/commits/:sha/diff', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  // Find the diff for this commit
  const commit = scenario.gitlab.commits.find((c: any) => c.id === req.params.sha);
  
  if (!commit) {
    return res.status(404).json({ error: 'Commit not found' });
  }
  
  res.json(scenario.gitlab.diffs[req.params.sha] || []);
});

// Get file content
gitlabRouter.get('/v4/projects/:projectId/repository/files/:filePath', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  const filePath = decodeURIComponent(req.params.filePath);
  const file = scenario.gitlab.files[filePath];
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.json(file);
});
```

#### routes/sourcegraph.ts

```typescript
import { Router } from 'express';
import { loadConfig, loadScenario } from '../config';

export const sourcegraphRouter = Router();

// GraphQL endpoint
sourcegraphRouter.post('/graphql', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  const { query, variables } = req.body;
  
  // Simple pattern matching to determine query type
  if (query.includes('search') && variables.query) {
    const searchQuery = variables.query.toLowerCase();
    
    if (searchQuery.includes('type:diff')) {
      // Recent changes search
      res.json(scenario.sourcegraph.recentChanges);
    } else {
      // Regular code search
      res.json(scenario.sourcegraph.search);
    }
  } else {
    res.status(400).json({ error: 'Unsupported query' });
  }
});
```

#### services/sql-server.ts

```typescript
import { Connection, Request } from 'tedious';
import * as net from 'net';
import { loadConfig, loadScenario } from '../config';

export function startSqlServer(port: number, scenarioName: string) {
  const scenario = loadScenario(scenarioName);
  
  const server = net.createServer((socket) => {
    console.log('[SQL Server] Client connected');
    
    // Simple TDS protocol mock
    // For MVP, we'll implement basic query pattern matching
    
    socket.on('data', (data) => {
      const query = parseQuery(data);
      
      if (!query) {
        return;
      }
      
      console.log(`[SQL Server] Query: ${query.substring(0, 100)}...`);
      
      const response = getQueryResponse(query, scenario);
      socket.write(formatTdsResponse(response));
    });
    
    socket.on('end', () => {
      console.log('[SQL Server] Client disconnected');
    });
  });
  
  server.listen(port, () => {
    console.log(`[Stub Service] SQL Server listening on port ${port}`);
  });
}

function parseQuery(data: Buffer): string | null {
  // Simplified query parsing
  // In a real implementation, we'd parse the TDS protocol
  // For stub purposes, we'll look for SQL keywords
  const str = data.toString('utf-8');
  
  if (str.includes('SELECT') || str.includes('select')) {
    return str;
  }
  
  return null;
}

function getQueryResponse(query: string, scenario: any): any {
  const queryLower = query.toLowerCase();
  
  // Schema query
  if (queryLower.includes('information_schema.columns')) {
    return scenario.database.schema;
  }
  
  // NULL check
  if (queryLower.includes('is null')) {
    return scenario.database.nullCheck || { error: 'Invalid column name' };
  }
  
  // Missing indexes
  if (queryLower.includes('dm_db_missing_index')) {
    return scenario.database.missingIndexes || [];
  }
  
  // Slow queries
  if (queryLower.includes('dm_exec_query_stats')) {
    return scenario.database.slowQueries || [];
  }
  
  // DDL history
  if (queryLower.includes('ddl') || queryLower.includes('audit')) {
    return scenario.database.ddlHistory || [];
  }
  
  // Default: empty result
  return [];
}

function formatTdsResponse(data: any): Buffer {
  // Simplified TDS response formatting
  // In production, we'd properly format according to TDS spec
  
  const json = JSON.stringify(data);
  return Buffer.from(json, 'utf-8');
}
```

### Scenario Data File

#### scenarios/missing-db-column.json

```json
{
  "id": "missing-db-column",
  "name": "Missing Database Column",
  "description": "Database migration renamed column but code not updated",
  
  "datadog": {
    "metrics": {
      "status": "ok",
      "series": [{
        "metric": "trace.http.request.errors",
        "points": [
          [1704794400000, 2.0],
          [1704795000000, 2.1],
          [1704795600000, 2.0],
          [1704796200000, 47.3]
        ],
        "scope": "service:api-service,http.status_code:5*"
      }]
    },
    
    "logs": {
      "data": [
        {
          "id": "log-001",
          "attributes": {
            "timestamp": "2026-01-09T10:15:23Z",
            "message": "TypeError: Cannot read property 'email' of undefined",
            "service": "api-service",
            "status": "error",
            "attributes": {
              "error.stack": "TypeError: Cannot read property 'email' of undefined\n    at UserController.getProfile (UserController.ts:145:28)",
              "http.status_code": 500
            }
          }
        }
      ]
    },
    
    "deployments": {
      "data": [{
        "id": "evt-001",
        "type": "event",
        "attributes": {
          "timestamp": "2026-01-09T10:00:00Z",
          "title": "Deployment: api-service v2.3.1",
          "tags": [
            "service:api-service",
            "git.commit.sha:abc123def456789012345678901234567890abcd"
          ]
        }
      }]
    }
  },
  
  "gitlab": {
    "commits": [
      {
        "id": "abc123def456789012345678901234567890abcd",
        "short_id": "abc123d",
        "title": "Refactor: Rename email column to EmailAddress",
        "author_email": "jane.doe@company.com",
        "authored_date": "2026-01-09T09:45:00Z"
      }
    ],
    
    "diffs": {
      "abc123def456789012345678901234567890abcd": [
        {
          "diff": "@@ -1,15 +1,15 @@\n-- Migration: Rename email column\nALTER TABLE Users\n-DROP COLUMN email;\n+DROP COLUMN email;\nALTER TABLE Users\n+ADD EmailAddress NVARCHAR(255);",
          "new_path": "migrations/20260109_rename_email_column.sql",
          "new_file": true
        }
      ]
    },
    
    "files": {
      "src/controllers/UserController.ts": {
        "file_name": "UserController.ts",
        "content": "base64_encoded_content_here",
        "ref": "abc123def456789012345678901234567890abcd"
      }
    }
  },
  
  "sourcegraph": {
    "search": {
      "data": {
        "search": {
          "results": {
            "matchCount": 127,
            "results": [
              {
                "__typename": "FileMatch",
                "file": {
                  "path": "src/controllers/UserController.ts",
                  "repository": {
                    "name": "gitlab.company.com/myorg/api-service"
                  }
                },
                "lineMatches": [{
                  "preview": "        email: user.email,",
                  "lineNumber": 145
                }]
              }
            ]
          }
        }
      }
    },
    
    "recentChanges": {
      "data": {
        "search": {
          "results": {
            "matchCount": 1,
            "results": [{
              "__typename": "CommitSearchResult",
              "commit": {
                "oid": "abc123def456789012345678901234567890abcd",
                "message": "Refactor: Rename email column to EmailAddress"
              }
            }]
          }
        }
      }
    }
  },
  
  "database": {
    "schema": [
      {
        "COLUMN_NAME": "UserId",
        "DATA_TYPE": "int",
        "IS_NULLABLE": "NO"
      },
      {
        "COLUMN_NAME": "Name",
        "DATA_TYPE": "nvarchar",
        "IS_NULLABLE": "NO"
      },
      {
        "COLUMN_NAME": "EmailAddress",
        "DATA_TYPE": "nvarchar",
        "IS_NULLABLE": "NO"
      },
      {
        "COLUMN_NAME": "CreatedAt",
        "DATA_TYPE": "datetime",
        "IS_NULLABLE": "NO"
      }
    ],
    
    "nullCheck": {
      "error": "Invalid column name 'Email'."
    },
    
    "ddlHistory": [
      {
        "event_time": "2026-01-09T10:00:00Z",
        "event_type": "ALTER_TABLE",
        "object_name": "Users",
        "statement": "ALTER TABLE Users DROP COLUMN email;"
      },
      {
        "event_time": "2026-01-09T10:00:01Z",
        "event_type": "ALTER_TABLE",
        "object_name": "Users",
        "statement": "ALTER TABLE Users ADD EmailAddress NVARCHAR(255);"
      }
    ]
  }
}
```

### Docker Configuration

#### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Expose ports
EXPOSE 3100 1433

CMD ["node", "dist/index.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  stub-service:
    build: .
    ports:
      - "3100:3100"  # HTTP APIs
      - "1433:1433"  # SQL Server
    environment:
      - SCENARIO=missing-db-column
      - BASE_TIMESTAMP=2026-01-09T10:00:00Z
      - HTTP_PORT=3100
      - SQL_PORT=1433
      - NODE_ENV=development
    volumes:
      - ./src/scenarios:/app/src/scenarios:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3100/health"]
      interval: 10s
      timeout: 5s
      retries: 3
```

#### package.json

```json
{
  "name": "incident-response-stub-service",
  "version": "1.0.0",
  "description": "Mock external services for integration testing",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",
    "docker:build": "docker-compose build",
    "docker:up": "docker-compose up",
    "docker:down": "docker-compose down"
  },
  "dependencies": {
    "express": "^4.18.2",
    "tedious": "^16.6.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

---

## Usage Examples

### Starting the Stub Service

```bash
# Using Docker Compose (recommended)
docker-compose up

# Using npm (for development)
npm run dev

# With custom scenario
SCENARIO=config-typo npm run dev
```

### Configuring Platform Services

Update your platform configuration to point to the stub service:

```typescript
// config/development.ts
export const config = {
  datadog: {
    endpoint: 'http://localhost:3100/datadog/api',
    apiKey: 'stub-api-key' // Any value works
  },
  
  gitlab: {
    endpoint: 'http://localhost:3100/gitlab/api',
    token: 'stub-token' // Any value works
  },
  
  sourcegraph: {
    endpoint: 'http://localhost:3100/sourcegraph/.api',
    token: 'stub-token' // Any value works
  },
  
  database: {
    host: 'localhost',
    port: 1433,
    user: 'incident_agent_readonly',
    password: 'any-password', // Any value works
    database: 'master'
  }
};
```

### Testing the Investigation Pipeline

```bash
# 1. Start stub service
docker-compose up -d

# 2. Verify health
curl http://localhost:3100/health

# 3. Run your platform's detection service
npm run start:detection

# 4. Trigger an incident (or wait for detection)
# The detection service will query Datadog stub at 10:30 AM scenario time
# and detect the anomaly

# 5. Watch logs as investigation proceeds
# - Investigation service queries all stubs in parallel
# - Analysis service receives complete evidence bundle
# - Notification service sends to Slack

# 6. Verify expected behavior
# - Check that all APIs were called
# - Verify evidence was collected correctly
# - Confirm analysis identified root cause
```

### Manual API Testing

```bash
# Test Datadog metrics
curl -X POST http://localhost:3100/datadog/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "sum:trace.http.request.errors{service:api-service}", "from": 1704794400, "to": 1704796200}'

# Test GitLab commits
curl http://localhost:3100/gitlab/api/v4/projects/1/repository/commits

# Test Sourcegraph search
curl -X POST http://localhost:3100/sourcegraph/.api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query($q: String!) { search(query: $q) { results { matchCount } } }", "variables": {"q": "user.email"}}'

# Test SQL Server (requires SQL client)
sqlcmd -S localhost,1433 -U incident_agent_readonly -P any-password \
  -Q "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'"
```

---

## Validation & Testing

### Expected Investigation Flow

1. **Detection Service** queries Datadog metrics stub
   - Receives elevated error rate at T+30
   - Creates incident record
   - Triggers investigation

2. **Investigation Service** queries all stubs in parallel:
   - **Datadog:** Gets error logs with stack trace → `UserController.ts:145`
   - **GitLab:** Gets recent commits → finds `abc123` from 10:00 AM
   - **GitLab:** Gets diff for `abc123` → shows column rename
   - **Database:** Queries schema → confirms `email` missing, `EmailAddress` present
   - **Sourcegraph:** Searches `user.email` → finds 127 references

3. **Analysis Service** receives evidence bundle:
   - Stack trace points to line 145
   - Commit abc123 renamed column 30 min before errors
   - Database confirms column missing
   - Sourcegraph shows widespread usage of old name
   - **Claude analysis:** High confidence root cause identified

4. **Notification Service** sends Slack message:
   - Root cause: Incomplete migration
   - Evidence: All sources correlate
   - Recommendation: Update 127 code references or rollback migration

### Success Criteria

The integration is successful if:

✅ All services connect to stub without errors  
✅ Detection service identifies anomaly at correct time  
✅ Investigation service collects evidence from all sources  
✅ Evidence shows coordinated story (same commit SHA, timestamps align)  
✅ Analysis service receives complete evidence bundle  
✅ Platform generates expected root cause analysis  
✅ Notification sent with actionable recommendations  

### Troubleshooting

**Problem:** Platform can't connect to stub  
**Solution:** Verify stub is running on correct ports (3100, 1433)

**Problem:** SQL queries fail  
**Solution:** Check that queries match patterns in `getQueryResponse()`

**Problem:** Wrong scenario data returned  
**Solution:** Verify `SCENARIO` environment variable is set correctly

**Problem:** Timestamps don't align  
**Solution:** All times in scenario should be relative to `BASE_TIMESTAMP`

---

## Future Enhancements

### After MVP is Working

Once basic integration is validated, consider:

1. **Add Scenario 2 (Config Typo)**
   - Demonstrates different error pattern
   - Tests handling of simple typos
   - Validates pattern matching

2. **Scenario Selection API**
   - `POST /scenario/select {"scenario": "config-typo"}`
   - Switch scenarios without restart
   - Useful for demo purposes

3. **Response Delays**
   - Simulate realistic API latencies
   - Test timeout handling
   - Validate retry logic

4. **Partial Failures**
   - Return 500 errors occasionally
   - Test graceful degradation
   - Validate circuit breaker

5. **Logging**
   - Log all API calls received
   - Track which endpoints are hit
   - Verify expected call patterns

---

## Conclusion

This simplified stub service provides everything needed to:

- Develop platform services locally without external dependencies
- Validate end-to-end integration across all components
- Demonstrate complete investigation flow with realistic data
- Test that evidence from multiple sources coordinates correctly

The single-service architecture keeps deployment simple while the scenario-based approach ensures realistic, coherent test data. By focusing on just 1-2 scenarios, we can quickly verify that all the pieces work together without getting bogged down in comprehensive test coverage.

---

**Next Steps:**

1. Implement basic Express server with routes
2. Create Scenario 1 JSON data file
3. Implement simple SQL Server mock
4. Test each API endpoint manually
5. Configure platform to use stub endpoints
6. Run end-to-end integration test
7. Add Scenario 2 if time permits

---

*Document Version: 1.0*  
*Last Updated: January 18, 2026*