export const mockMetricsResponse = {
  status: 'ok',
  series: [
    {
      metric: 'error.rate',
      pointlist: [
        [1705226400000, 10],
        [1705226460000, 12],
        [1705226520000, 150], // Spike
        [1705226580000, 145],
        [1705226640000, 140],
      ],
      scope: 'service:api',
      expression: 'sum:error.rate{service:api}',
    },
  ],
};

export const mockErrorTrackingResponse = {
  data: [
    {
      type: 'error_tracking_issue',
      id: 'issue-123',
      attributes: {
        title: 'Database connection timeout',
        status: 'unresolved',
        first_seen: '2026-01-14T09:45:00Z',
        last_seen: '2026-01-14T10:00:00Z',
        count: 42,
        impacted_users: 15,
        service: 'api-service',
        env: 'production',
        stack_trace:
          'Error: Connection timeout\n  at Database.connect (src/db/connection.ts:42)',
      },
    },
  ],
  meta: {
    page: {
      total_count: 1,
    },
  },
};

export const mockDeploymentEventResponse = {
  events: [
    {
      id: 12345,
      title: 'Deployment to production',
      text: 'Deployed version 1.2.3 with commit abc123',
      date_happened: 1705225800,
      tags: ['deployment', 'production', 'commit:abc123'],
      source: 'deployment',
    },
  ],
};

export const mockLogsResponse = {
  data: [
    {
      id: 'log-123',
      type: 'log',
      attributes: {
        message: 'Database connection failed: timeout after 30s',
        timestamp: '2026-01-14T10:00:00.000Z',
        status: 'error',
        service: 'api-service',
        host: 'api-pod-123',
        tags: ['env:production', 'service:api-service'],
      },
    },
  ],
};
