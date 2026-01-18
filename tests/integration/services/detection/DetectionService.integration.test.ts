// Mock all external dependencies before imports
const mockDatadogClient = {
  queryMetrics: jest.fn().mockResolvedValue({
    series: [{ pointlist: [[Date.now(), 10]] }],
  }),
  getErrorTrackingIssues: jest.fn().mockResolvedValue([]),
  getDeploymentEvents: jest.fn().mockResolvedValue([]),
};

const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
};

const mockDatabaseClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  createIncident: jest.fn().mockResolvedValue({ id: 'test-id' }),
  getRecentIncidents: jest.fn().mockResolvedValue([]),
};

jest.mock('../../../../src/services/detection/MonitorManager', () => ({
  MonitorManager: jest.fn().mockImplementation(() => ({
    loadMonitors: jest.fn().mockResolvedValue(undefined),
    getMonitors: jest.fn().mockReturnValue([]),
    getEnabledMonitors: jest.fn().mockReturnValue([]),
    getAllMonitors: jest.fn().mockReturnValue([]),
    reloadConfiguration: jest.fn().mockResolvedValue(undefined),
    startWatching: jest.fn(),
    stopWatching: jest.fn(),
  })),
}));

jest.mock('../../../../src/config', () => ({
  config: {
    monitoring: {
      configPath: './config/monitors.json',
      hotReload: true,
    },
    redis: {
      host: 'localhost',
      port: 6379,
    },
    database: {
      host: 'localhost',
      port: 1433,
      database: 'test',
      username: 'sa',
      password: 'test',
    },
    datadog: {
      apiKey: 'test-key',
      appKey: 'test-app-key',
      site: 'datadoghq.com',
    },
  },
}));

jest.mock('../../../../src/lib/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { DetectionService } from '../../../../src/services/detection';

describe('DetectionService Integration', () => {
  let service: DetectionService;

  beforeAll(async () => {
    service = new DetectionService(
      mockDatadogClient as any,
      mockRedisClient as any,
      mockDatabaseClient as any
    );
  });

  afterAll(async () => {
    await service.stop();
  });

  it('should start without errors', async () => {
    await expect(service.start()).resolves.not.toThrow();
  });

  it('should stop without errors', async () => {
    await expect(service.stop()).resolves.not.toThrow();
  });
});
