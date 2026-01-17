import { PromptEngine } from '../../../../src/services/analysis/PromptEngine';
import type { Incident } from '../../../../src/lib/types/incident';
import type { EvidenceBundle, DatadogContext } from '../../../../src/lib/types/evidence';

describe('PromptEngine', () => {
  let promptEngine: PromptEngine;

  beforeEach(() => {
    promptEngine = new PromptEngine();
  });

  describe('buildAnalysisPrompt', () => {
    const mockIncident: Incident = {
      id: 'inc-123',
      externalId: 'ext-123',
      monitorId: 'mon-123',
      serviceName: 'api-service',
      severity: 'critical',
      status: 'active',
      investigationTier: 'tier2',
      metricName: 'api.errors.5xx',
      metricValue: 150,
      baselineValue: 10,
      thresholdValue: 50,
      deviationPercentage: 1400,
      errorMessage: 'NullPointerException',
      stackTrace: 'at com.example.Service.method(Service.java:42)',
      detectedAt: new Date('2026-01-17T10:00:00Z'),
      createdAt: new Date('2026-01-17T10:00:00Z'),
      updatedAt: new Date('2026-01-17T10:00:00Z'),
      tags: ['service:api', 'env:production'],
    };

    const mockDatadogContext: DatadogContext = {
      errorDetails: {
        errorMessage: 'NullPointerException',
        stackTrace: 'at com.example.Service.method(Service.java:42)',
        filePath: 'com/example/Service.java',
        lineNumber: 42,
      },
      metricHistory: [
        { timestamp: new Date('2026-01-17T09:55:00Z'), value: 10 },
        { timestamp: new Date('2026-01-17T10:00:00Z'), value: 150 },
      ],
    };

    const mockEvidence: EvidenceBundle = {
      incidentId: 'inc-123',
      investigationTier: 'tier2',
      completeness: 0.8,
      collectedAt: new Date('2026-01-17T10:01:00Z'),
      datadogContext: mockDatadogContext,
      gitlabContext: {
        commits: [
          {
            sha: 'abc123def456',
            message: 'Fix null handling in service layer',
            author: { name: 'John Doe', email: 'john@example.com' },
            timestamp: new Date('2026-01-17T09:30:00Z'),
            repository: 'myorg/api-service',
            filesChanged: ['src/main/java/com/example/Service.java'],
            additions: 10,
            deletions: 2,
            score: { temporal: 0.9, risk: 0.7, combined: 0.85 },
          },
        ],
        scoringMethod: 'stack-trace',
      },
    };

    it('should build a prompt with incident details', () => {
      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, mockEvidence);

      expect(prompt).toContain('api-service');
      expect(prompt).toContain('NullPointerException');
      expect(prompt).toContain('api.errors.5xx');
      expect(prompt).toContain('150');
      expect(prompt).toContain('10');
      expect(prompt).toContain('critical');
      expect(prompt).toContain('tier2');
    });

    it('should include Datadog context', () => {
      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, mockEvidence);

      expect(prompt).toContain('DATADOG CONTEXT');
      expect(prompt).toContain('NullPointerException');
      expect(prompt).toContain('Service.java:42');
    });

    it('should include GitLab commits', () => {
      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, mockEvidence);

      expect(prompt).toContain('GITLAB COMMITS');
      expect(prompt).toContain('abc123def456');
      expect(prompt).toContain('John Doe');
      expect(prompt).toContain('Fix null handling');
      expect(prompt).toContain('0.85');
    });

    it('should include JSON schema in response format', () => {
      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, mockEvidence);

      expect(prompt).toContain('Respond with ONLY valid JSON');
      expect(prompt).toContain('"summary"');
      expect(prompt).toContain('"rootCause"');
      expect(prompt).toContain('"recommendedActions"');
    });

    it('should handle missing optional contexts', () => {
      const minimalEvidence: EvidenceBundle = {
        incidentId: 'inc-123',
        investigationTier: 'tier3',
        completeness: 0.3,
        collectedAt: new Date(),
        datadogContext: {
          metricHistory: [],
        },
      };

      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, minimalEvidence);

      expect(prompt).toContain('INCIDENT DETAILS');
      expect(prompt).toContain('DATADOG CONTEXT');
      expect(prompt).not.toContain('GITLAB COMMITS');
      expect(prompt).not.toContain('DATABASE FINDINGS');
    });

    it('should include deployment event when present', () => {
      const evidenceWithDeployment: EvidenceBundle = {
        ...mockEvidence,
        datadogContext: {
          ...mockDatadogContext,
          deploymentEvent: {
            commitSha: 'deploy123',
            repository: 'myorg/api-service',
            timestamp: new Date('2026-01-17T09:45:00Z'),
          },
        },
      };

      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, evidenceWithDeployment);

      expect(prompt).toContain('Deployment: deploy123');
      expect(prompt).toContain('myorg/api-service');
    });

    it('should include database findings when present', () => {
      const evidenceWithDatabase: EvidenceBundle = {
        ...mockEvidence,
        databaseContext: {
          schemaFindings: [
            {
              type: 'missing_column',
              severity: 'high',
              description: 'Column user_id missing from orders table',
              tableName: 'orders',
              columnName: 'user_id',
            },
          ],
          dataFindings: [
            {
              type: 'unexpected_nulls',
              severity: 'medium',
              description: 'Found null values in required field',
              tableName: 'users',
              affectedRows: 15,
            },
          ],
          performanceFindings: [],
          relevance: 'high',
        },
      };

      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, evidenceWithDatabase);

      expect(prompt).toContain('DATABASE FINDINGS');
      expect(prompt).toContain('Schema Issues');
      expect(prompt).toContain('missing_column');
      expect(prompt).toContain('Data Issues');
      expect(prompt).toContain('unexpected_nulls');
    });

    it('should include sourcegraph context when present', () => {
      const evidenceWithSourcegraph: EvidenceBundle = {
        ...mockEvidence,
        sourcegraphContext: {
          affectedRepositories: 3,
          estimatedReferences: 42,
          criticalPaths: ['api/handlers', 'lib/utils'],
          matches: [
            {
              repository: 'myorg/shared-lib',
              filePath: 'src/utils.ts',
              lineNumber: 100,
              preview: 'const result = service.process(data);',
              matchCount: 5,
            },
          ],
        },
      };

      const prompt = promptEngine.buildAnalysisPrompt(mockIncident, evidenceWithSourcegraph);

      expect(prompt).toContain('SOURCEGRAPH ANALYSIS');
      expect(prompt).toContain('Affected Repositories: 3');
      expect(prompt).toContain('Estimated References: 42');
      expect(prompt).toContain('api/handlers');
    });
  });

  describe('buildInvestigationStrategyPrompt', () => {
    it('should build a strategy prompt', () => {
      const incident: Incident = {
        id: 'inc-123',
        externalId: 'ext-123',
        monitorId: 'mon-123',
        serviceName: 'api-service',
        severity: 'high',
        status: 'active',
        investigationTier: 'tier2',
        metricName: 'api.latency',
        metricValue: 500,
        baselineValue: 100,
        thresholdValue: 200,
        deviationPercentage: 400,
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };

      const prompt = promptEngine.buildInvestigationStrategyPrompt(incident);

      expect(prompt).toContain('api-service');
      expect(prompt).toContain('api.latency');
      expect(prompt).toContain('500');
      expect(prompt).toContain('100');
      expect(prompt).toContain('needsGitLab');
      expect(prompt).toContain('needsDatabase');
      expect(prompt).toContain('needsSourcegraph');
    });
  });

  describe('buildEvidenceSynthesisPrompt', () => {
    it('should build an evidence synthesis prompt', () => {
      const evidence: EvidenceBundle = {
        incidentId: 'inc-123',
        investigationTier: 'tier2',
        completeness: 0.7,
        collectedAt: new Date(),
        datadogContext: {
          metricHistory: [],
        },
      };

      const prompt = promptEngine.buildEvidenceSynthesisPrompt(evidence);

      expect(prompt).toContain('EVIDENCE COLLECTED');
      expect(prompt).toContain('relevantEvidence');
      expect(prompt).toContain('likelyRootCause');
      expect(prompt).toContain('confidence');
    });
  });
});
