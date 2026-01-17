import { MonitorManager } from '../../../../src/services/detection/MonitorManager';
import fs from 'fs/promises';

jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('MonitorManager', () => {
  let manager: MonitorManager;
  const testConfigPath = '/test/config/monitors.json';

  beforeEach(() => {
    manager = new MonitorManager(testConfigPath);
    jest.clearAllMocks();
  });

  describe('loadMonitors', () => {
    it('should load valid monitor configurations', async () => {
      const validConfig = {
        monitors: [
          {
            id: 'test-monitor',
            name: 'Test Monitor',
            description: 'A test monitor',
            enabled: true,
            queries: {
              metric: 'test.metric',
            },
            checkIntervalSeconds: 60,
            threshold: {
              type: 'absolute',
              warning: 50,
              critical: 100,
            },
            timeWindow: '5m',
            gitlabRepositories: ['myorg/repo'],
            enableDatabaseInvestigation: false,
            teamsNotification: {
              channelWebhookUrl: 'https://example.com/webhook',
            },
            tags: ['test'],
            severity: 'high',
          },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      await manager.loadMonitors();

      expect(manager.getMonitorCount()).toBe(1);
      expect(manager.getMonitor('test-monitor')).toBeDefined();
      expect(manager.getMonitor('test-monitor')?.name).toBe('Test Monitor');
    });

    it('should skip disabled monitors', async () => {
      const configWithDisabled = {
        monitors: [
          {
            id: 'enabled-monitor',
            name: 'Enabled',
            description: 'Enabled monitor',
            enabled: true,
            queries: { metric: 'test.metric' },
            checkIntervalSeconds: 60,
            threshold: { type: 'absolute', warning: 50, critical: 100 },
            timeWindow: '5m',
            gitlabRepositories: [],
            enableDatabaseInvestigation: false,
            teamsNotification: { channelWebhookUrl: 'https://example.com' },
            tags: [],
            severity: 'medium',
          },
          {
            id: 'disabled-monitor',
            name: 'Disabled',
            description: 'Disabled monitor',
            enabled: false,
            queries: { metric: 'test.metric' },
            checkIntervalSeconds: 60,
            threshold: { type: 'absolute', warning: 50, critical: 100 },
            timeWindow: '5m',
            gitlabRepositories: [],
            enableDatabaseInvestigation: false,
            teamsNotification: { channelWebhookUrl: 'https://example.com' },
            tags: [],
            severity: 'low',
          },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(configWithDisabled));

      await manager.loadMonitors();

      expect(manager.getMonitorCount()).toBe(1);
      expect(manager.getMonitor('enabled-monitor')).toBeDefined();
      expect(manager.getMonitor('disabled-monitor')).toBeUndefined();
    });

    it('should throw ValidationError for invalid configuration', async () => {
      const invalidConfig = {
        monitors: [
          {
            id: 'invalid-monitor',
            // Missing required fields
          },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(manager.loadMonitors()).rejects.toThrow();
    });
  });

  describe('getMonitors', () => {
    it('should return all enabled monitors', async () => {
      const config = {
        monitors: [
          {
            id: 'monitor-1',
            name: 'Monitor 1',
            description: 'First monitor',
            enabled: true,
            queries: { metric: 'test.metric.1' },
            checkIntervalSeconds: 60,
            threshold: { type: 'percentage', warning: 5, critical: 10 },
            timeWindow: '5m',
            gitlabRepositories: [],
            enableDatabaseInvestigation: false,
            teamsNotification: { channelWebhookUrl: 'https://example.com' },
            tags: [],
            severity: 'high',
          },
          {
            id: 'monitor-2',
            name: 'Monitor 2',
            description: 'Second monitor',
            enabled: true,
            queries: { metric: 'test.metric.2' },
            checkIntervalSeconds: 120,
            threshold: { type: 'multiplier', warning: 2, critical: 5 },
            timeWindow: '10m',
            gitlabRepositories: [],
            enableDatabaseInvestigation: false,
            teamsNotification: { channelWebhookUrl: 'https://example.com' },
            tags: [],
            severity: 'medium',
          },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      await manager.loadMonitors();

      const monitors = manager.getMonitors();
      expect(monitors).toHaveLength(2);
      expect(monitors.map((m) => m.id)).toContain('monitor-1');
      expect(monitors.map((m) => m.id)).toContain('monitor-2');
    });
  });
});
