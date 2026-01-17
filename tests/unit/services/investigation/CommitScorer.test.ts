import { CommitScorer } from '../../../../src/services/investigation/CommitScorer';
import type { CommitScoringInput, CommitScoringContext } from '../../../../src/services/investigation/types';

describe('CommitScorer', () => {
  let scorer: CommitScorer;

  beforeEach(() => {
    scorer = new CommitScorer(24); // 24 hour window
  });

  const createCommit = (overrides: Partial<CommitScoringInput> = {}): CommitScoringInput => ({
    sha: 'abc123',
    message: 'feat: add new feature',
    author: { name: 'Test User', email: 'test@example.com' },
    timestamp: new Date('2024-01-15T10:00:00Z'),
    repository: 'org/repo',
    filesChanged: ['src/index.ts'],
    additions: 50,
    deletions: 10,
    ...overrides,
  });

  const createContext = (overrides: Partial<CommitScoringContext> = {}): CommitScoringContext => ({
    incidentDetectedAt: new Date('2024-01-15T12:00:00Z'),
    recentDeploymentWindow: 24 * 60 * 60 * 1000,
    ...overrides,
  });

  describe('scoreCommits', () => {
    it('should score and sort commits by combined score', () => {
      const commits = [
        createCommit({ sha: 'low', timestamp: new Date('2024-01-14T10:00:00Z'), message: 'docs: update readme' }),
        createCommit({ sha: 'high', timestamp: new Date('2024-01-15T11:30:00Z'), message: 'fix: urgent hotfix' }),
        createCommit({ sha: 'medium', timestamp: new Date('2024-01-15T08:00:00Z'), message: 'feat: add feature' }),
      ];
      const context = createContext();

      const scored = scorer.scoreCommits(commits, context);

      expect(scored).toHaveLength(3);
      expect(scored[0].sha).toBe('high');
      expect(scored[0].score.combined).toBeGreaterThan(scored[1].score.combined);
      expect(scored[1].score.combined).toBeGreaterThan(scored[2].score.combined);
    });

    it('should return empty array for empty input', () => {
      const context = createContext();
      const scored = scorer.scoreCommits([], context);
      expect(scored).toEqual([]);
    });
  });

  describe('temporal scoring', () => {
    it('should give higher score to commits closer to incident time', () => {
      const recentCommit = createCommit({
        sha: 'recent',
        timestamp: new Date('2024-01-15T11:30:00Z'), // 30 min before incident
      });
      const olderCommit = createCommit({
        sha: 'older',
        timestamp: new Date('2024-01-15T06:00:00Z'), // 6 hours before incident
      });
      const context = createContext();

      const scored = scorer.scoreCommits([olderCommit, recentCommit], context);

      const recentScored = scored.find((c) => c.sha === 'recent')!;
      const olderScored = scored.find((c) => c.sha === 'older')!;

      expect(recentScored.score.temporal).toBeGreaterThan(olderScored.score.temporal);
    });

    it('should give zero temporal score to commits after incident', () => {
      const commit = createCommit({
        timestamp: new Date('2024-01-15T13:00:00Z'), // 1 hour after incident
      });
      const context = createContext();

      const scored = scorer.scoreCommits([commit], context);

      expect(scored[0].score.temporal).toBe(0);
      expect(scored[0].scoringFactors.some((f) => f.name === 'after_incident')).toBe(true);
    });

    it('should give bonus to deployment commit', () => {
      const deployCommit = createCommit({ sha: 'deploy123' });
      const normalCommit = createCommit({ sha: 'normal456' });
      const context = createContext({ deploymentCommitSha: 'deploy123' });

      const scored = scorer.scoreCommits([normalCommit, deployCommit], context);

      const deployScored = scored.find((c) => c.sha === 'deploy123')!;
      expect(deployScored.scoringFactors.some((f) => f.name === 'deployment_commit')).toBe(true);
    });
  });

  describe('risk scoring', () => {
    it('should give higher risk score for stack trace file match', () => {
      const matchingCommit = createCommit({
        sha: 'match',
        filesChanged: ['src/services/UserService.ts'],
      });
      const nonMatchingCommit = createCommit({
        sha: 'nomatch',
        filesChanged: ['src/utils/helpers.ts'],
      });
      const context = createContext({
        stackTraceFilePath: 'src/services/UserService.ts',
      });

      const scored = scorer.scoreCommits([nonMatchingCommit, matchingCommit], context);

      const matchScored = scored.find((c) => c.sha === 'match')!;
      const nonMatchScored = scored.find((c) => c.sha === 'nomatch')!;

      expect(matchScored.score.risk).toBeGreaterThan(nonMatchScored.score.risk);
      expect(matchScored.scoringFactors.some((f) => f.name === 'stack_trace_match')).toBe(true);
    });

    it('should identify risky file patterns', () => {
      const riskyCommit = createCommit({
        filesChanged: ['src/config/database.ts', 'migrations/001_add_users.sql'],
      });
      const context = createContext();

      const scored = scorer.scoreCommits([riskyCommit], context);

      expect(scored[0].scoringFactors.some((f) => f.name === 'risky_files')).toBe(true);
    });

    it('should score medium-sized changes higher than tiny or huge changes', () => {
      const tinyCommit = createCommit({ sha: 'tiny', additions: 2, deletions: 1 });
      const mediumCommit = createCommit({ sha: 'medium', additions: 80, deletions: 20 });
      const hugeCommit = createCommit({ sha: 'huge', additions: 1000, deletions: 500 });
      const context = createContext();

      const scored = scorer.scoreCommits([tinyCommit, mediumCommit, hugeCommit], context);

      const tinyScored = scored.find((c) => c.sha === 'tiny')!;
      const mediumScored = scored.find((c) => c.sha === 'medium')!;
      const hugeScored = scored.find((c) => c.sha === 'huge')!;

      // Medium changes should have higher change size factor
      const getMediumChangeFactor = (s: typeof tinyScored) =>
        s.scoringFactors.find((f) => f.name === 'change_size')?.value || 0;

      expect(getMediumChangeFactor(mediumScored)).toBeGreaterThan(getMediumChangeFactor(tinyScored));
      expect(getMediumChangeFactor(mediumScored)).toBeGreaterThan(getMediumChangeFactor(hugeScored));
    });
  });

  describe('commit message scoring', () => {
    it('should give higher score to urgent/fix messages', () => {
      const urgentCommit = createCommit({ sha: 'urgent', message: 'fix: urgent hotfix for prod issue' });
      const normalCommit = createCommit({ sha: 'normal', message: 'feat: add new button' });
      const context = createContext();

      const scored = scorer.scoreCommits([normalCommit, urgentCommit], context);

      const urgentScored = scored.find((c) => c.sha === 'urgent')!;
      const normalScored = scored.find((c) => c.sha === 'normal')!;

      expect(urgentScored.score.risk).toBeGreaterThan(normalScored.score.risk);
    });

    it('should give lower score to doc/test messages', () => {
      const docCommit = createCommit({ sha: 'doc', message: 'docs: update README with examples' });
      const codeCommit = createCommit({ sha: 'code', message: 'refactor: improve error handling' });
      const context = createContext();

      const scored = scorer.scoreCommits([docCommit, codeCommit], context);

      const docScored = scored.find((c) => c.sha === 'doc')!;
      const codeScored = scored.find((c) => c.sha === 'code')!;

      expect(docScored.score.risk).toBeLessThan(codeScored.score.risk);
    });
  });

  describe('scoring factors', () => {
    it('should include detailed scoring factors', () => {
      const commit = createCommit({
        message: 'fix: critical database migration',
        filesChanged: ['migrations/001.sql', 'src/config/db.ts'],
      });
      const context = createContext();

      const scored = scorer.scoreCommits([commit], context);

      expect(scored[0].scoringFactors.length).toBeGreaterThan(0);
      scored[0].scoringFactors.forEach((factor) => {
        expect(factor).toHaveProperty('name');
        expect(factor).toHaveProperty('weight');
        expect(factor).toHaveProperty('value');
        expect(factor).toHaveProperty('contribution');
        expect(factor).toHaveProperty('reason');
      });
    });
  });
});
