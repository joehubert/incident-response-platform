import { TierStrategySelector } from '../../../../src/services/investigation/TierStrategySelector';
import type { Incident, MonitorConfig } from '../../../../src/lib/types/incident';

describe('TierStrategySelector', () => {
  let selector: TierStrategySelector;

  beforeEach(() => {
    selector = new TierStrategySelector();
  });

  const createIncident = (overrides: Partial<Incident> = {}): Incident => ({
    id: 'inc-123',
    externalId: 'ext-123',
    monitorId: 'mon-123',
    serviceName: 'test-service',
    severity: 'medium',
    status: 'active',
    investigationTier: 'tier1',
    metricName: 'error_rate',
    metricValue: 100,
    baselineValue: 10,
    thresholdValue: 50,
    deviationPercentage: 900,
    detectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    ...overrides,
  });

  const createMonitorConfig = (overrides: Partial<MonitorConfig> = {}): MonitorConfig => ({
    id: 'mon-123',
    name: 'Test Monitor',
    description: 'A test monitor',
    enabled: true,
    queries: { metric: 'test.metric' },
    checkIntervalSeconds: 60,
    threshold: { type: 'absolute', warning: 50, critical: 100 },
    timeWindow: '5m',
    gitlabRepositories: [],
    enableDatabaseInvestigation: false,
    teamsNotification: { channelWebhookUrl: 'https://example.com/webhook' },
    tags: [],
    severity: 'medium',
    ...overrides,
  });

  describe('selectTier', () => {
    it('should select tier1 for low severity without context', () => {
      const incident = createIncident({ severity: 'low' });
      const config = createMonitorConfig();

      const tier = selector.selectTier(incident, config);

      expect(tier).toBe('tier1');
    });

    it('should select tier1 for medium severity without GitLab config', () => {
      const incident = createIncident({ severity: 'medium' });
      const config = createMonitorConfig({ gitlabRepositories: [] });

      const tier = selector.selectTier(incident, config);

      expect(tier).toBe('tier1');
    });

    it('should select tier2 for high severity with GitLab config', () => {
      const incident = createIncident({ severity: 'high' });
      const config = createMonitorConfig({ gitlabRepositories: ['org/repo'] });

      const tier = selector.selectTier(incident, config);

      expect(tier).toBe('tier2');
    });

    it('should select tier2 for critical severity with GitLab config', () => {
      const incident = createIncident({ severity: 'critical' });
      const config = createMonitorConfig({ gitlabRepositories: ['org/repo'] });

      const tier = selector.selectTier(incident, config);

      expect(tier).toBe('tier2');
    });

    it('should select tier2 with stack trace and GitLab config', () => {
      const incident = createIncident({
        severity: 'medium',
        stackTrace: 'Error at file.ts:10',
      });
      const config = createMonitorConfig({ gitlabRepositories: ['org/repo'] });

      const tier = selector.selectTier(incident, config);

      expect(tier).toBe('tier2');
    });

    it('should select tier3 for critical with stack trace and database config', () => {
      const incident = createIncident({
        severity: 'critical',
        stackTrace: 'Error at file.ts:10',
      });
      const config = createMonitorConfig({
        gitlabRepositories: ['org/repo'],
        enableDatabaseInvestigation: true,
        databaseContext: {
          relevantTables: ['users', 'orders'],
          relevantSchemas: ['dbo'],
        },
      });

      const tier = selector.selectTier(incident, config);

      expect(tier).toBe('tier3');
    });
  });

  describe('getStrategy', () => {
    it('should return tier1 strategy with no external collection', () => {
      const config = createMonitorConfig();

      const strategy = selector.getStrategy('tier1', config);

      expect(strategy.tier).toBe('tier1');
      expect(strategy.collectGitLabContext).toBe(false);
      expect(strategy.collectDatabaseContext).toBe(false);
      expect(strategy.collectSourcegraphContext).toBe(false);
      expect(strategy.maxCommitsToAnalyze).toBe(0);
      expect(strategy.includeCommitDiffs).toBe(false);
    });

    it('should return tier2 strategy with GitLab collection', () => {
      const config = createMonitorConfig({ gitlabRepositories: ['org/repo'] });

      const strategy = selector.getStrategy('tier2', config);

      expect(strategy.tier).toBe('tier2');
      expect(strategy.collectGitLabContext).toBe(true);
      expect(strategy.collectDatabaseContext).toBe(false);
      expect(strategy.collectSourcegraphContext).toBe(false);
      expect(strategy.maxCommitsToAnalyze).toBe(10);
      expect(strategy.includeCommitDiffs).toBe(true);
    });

    it('should return tier3 strategy with all collection enabled', () => {
      const config = createMonitorConfig({
        gitlabRepositories: ['org/repo'],
        enableDatabaseInvestigation: true,
        databaseContext: {
          relevantTables: ['users'],
          relevantSchemas: ['dbo'],
        },
      });

      const strategy = selector.getStrategy('tier3', config);

      expect(strategy.tier).toBe('tier3');
      expect(strategy.collectGitLabContext).toBe(true);
      expect(strategy.collectDatabaseContext).toBe(true);
      expect(strategy.collectSourcegraphContext).toBe(true);
      expect(strategy.maxCommitsToAnalyze).toBe(20);
      expect(strategy.includeCommitDiffs).toBe(true);
    });

    it('should disable database collection in tier3 if not configured', () => {
      const config = createMonitorConfig({
        gitlabRepositories: ['org/repo'],
        enableDatabaseInvestigation: false,
      });

      const strategy = selector.getStrategy('tier3', config);

      expect(strategy.collectDatabaseContext).toBe(false);
    });
  });

  describe('refineTier', () => {
    it('should upgrade tier1 to tier2 with deployment event and GitLab config', () => {
      const config = createMonitorConfig({ gitlabRepositories: ['org/repo'] });

      const refined = selector.refineTier('tier1', true, config);

      expect(refined).toBe('tier2');
    });

    it('should not upgrade tier1 without GitLab config', () => {
      const config = createMonitorConfig({ gitlabRepositories: [] });

      const refined = selector.refineTier('tier1', true, config);

      expect(refined).toBe('tier1');
    });

    it('should upgrade tier2 to tier3 with deployment event and database config', () => {
      const config = createMonitorConfig({
        gitlabRepositories: ['org/repo'],
        enableDatabaseInvestigation: true,
        databaseContext: {
          relevantTables: ['users'],
          relevantSchemas: ['dbo'],
        },
      });

      const refined = selector.refineTier('tier2', true, config);

      expect(refined).toBe('tier3');
    });

    it('should not upgrade tier2 without deployment event', () => {
      const config = createMonitorConfig({
        gitlabRepositories: ['org/repo'],
        enableDatabaseInvestigation: true,
      });

      const refined = selector.refineTier('tier2', false, config);

      expect(refined).toBe('tier2');
    });

    it('should not change tier3', () => {
      const config = createMonitorConfig();

      const refined = selector.refineTier('tier3', true, config);

      expect(refined).toBe('tier3');
    });
  });
});
