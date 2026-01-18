# Incident Response Stub Service

This directory contains a lightweight stub service designed to mock all external dependencies for the Incident Response Platform. It provides predictable, canned responses for services like Datadog, GitLab, Sourcegraph, and a mock MS SQL Server, enabling local development and integration testing without needing access to production credentials or VPNs.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Getting Started

The stub service is managed via Docker Compose.

### Build the Docker Image

To build the image, run the following command from the `tests/stubs` directory:

```bash
docker-compose build
```

Alternatively, you can use the npm script:
```bash
npm run docker:build
```

### Start the Service

To start the stub service in detached mode:

```bash
docker-compose up -d
```
or
```bash
npm run docker:up
```

The service will expose two ports:
- **HTTP APIs**: `http://localhost:3100`
- **Mock SQL Server**: `localhost:1433`

### Stop the Service

To stop the service and remove the container:

```bash
docker-compose down
```
or
```bash
npm run docker:down
```

### Local Development

For local development without Docker, you can run the service directly using `ts-node`:

```bash
# Install dependencies
npm install

# Run the service
npm run dev
```

The service will watch for changes and restart automatically.

## Configuration

The service's behavior is controlled by environment variables, which can be set in the `docker-compose.yml` file or your shell.

- **`SCENARIO`**: Determines which test scenario data to serve.
  - `missing-db-column` (default): Simulates an incident caused by a renamed database column.
  - `config-typo`: A placeholder for a configuration typo scenario.
- **`HTTP_PORT`**: The port for the HTTP mock APIs (default: `3100`).
- **`SQL_PORT`**: The port for the TDS protocol (SQL Server) mock (default: `1433`).

To run a different scenario, set the `SCENARIO` variable:
```bash
SCENARIO=config-typo docker-compose up -d
```

## Testing the Stub Service

You can test the running service using `curl` or a client like Postman.

### Health Check

Verify that the service is running and see the active scenario.

```bash
curl http://localhost:3100/health
```
**Expected Response:**
```json
{
  "status": "healthy",
  "scenario": "missing-db-column",
  "timestamp": "..."
}
```

---

### Datadog API (`/datadog/api`)

#### Metrics Query
```bash
curl -X POST http://localhost:3100/datadog/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "sum:trace.http.request.errors{service:api-service,http.status_code:5*}.as_rate()",
    "from": 1704794400,
    "to": 1704796200
  }'
```

#### Log Search
```bash
curl -X POST http://localhost:3100/datadog/api/v2/logs/events/search \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "query": "service:api-service status:error",
      "from": "2026-01-09T10:15:00Z",
      "to": "2026-01-09T10:35:00Z"
    }
  }'
```

#### Deployment Events
```bash
curl "http://localhost:3100/datadog/api/v2/events?filter[query]=service:api-service%20type:deployment"
```

---

### GitLab API (`/gitlab/api`)

#### Get Recent Commits
```bash
curl "http://localhost:3100/gitlab/api/v4/projects/1/repository/commits?since=2026-01-09T09:00:00Z"
```

#### Get Commit Diff
```bash
curl "http://localhost:3100/gitlab/api/v4/projects/1/repository/commits/abc123def456789012345678901234567890abcd/diff"
```

#### Get File Content
```bash
curl "http://localhost:3100/gitlab/api/v4/projects/1/repository/files/src%252Fcontrollers%252FUserController.ts?ref=abc123def456789012345678901234567890abcd"
```

---

### Sourcegraph API (`/sourcegraph/.api`)

#### Code Search
```bash
curl -X POST http://localhost:3100/sourcegraph/.api/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($query: String!) { search(query: $query) { results { matchCount } } }",
    "variables": { "query": "user.email" }
  }'
```

#### Recent Changes Search (Diff Search)
```bash
curl -X POST http://localhost:3100/sourcegraph/.api/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($query: String!) { search(query: $query) { results { ... on CommitSearchResult { commit { oid } } } } }",
    "variables": { "query": "user.email type:diff after:\"7 days ago\"" }
  }'
```

---

### MS SQL Server Mock

The mock SQL server runs on port **1433**. It does not speak full TDS, but it responds to specific queries based on simple string matching. You can test it with a standard SQL client.

**Example using `sqlcmd`:**
```bash
sqlcmd -S localhost,1433 -U any_user -P any_password \
  -Q "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users';"
```
**Expected Response (for `missing-db-column` scenario):**
A JSON string representing the query result.
```json
[
  {"COLUMN_NAME":"UserId","DATA_TYPE":"int","IS_NULLABLE":"NO"},
  {"COLUMN_NAME":"Name","DATA_TYPE":"nvarchar","IS_NULLABLE":"NO"},
  {"COLUMN_NAME":"EmailAddress","DATA_TYPE":"nvarchar","IS_NULLABLE":"NO"},
  {"COLUMN_NAME":"CreatedAt","DATA_TYPE":"datetime","IS_NULLABLE":"NO"}
]
```
Note: The response from the mock is a raw JSON string, not a proper TDS response. A real SQL client might not parse it correctly, but it is sufficient for the application's database client to consume.
