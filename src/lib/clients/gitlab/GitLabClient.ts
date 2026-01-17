import axios, { AxiosInstance } from 'axios';
import { config } from '../../../config';
import { ExternalAPIError } from '../../utils/errors';
import logger from '../../utils/logger';
import { externalApiCalls, externalApiDuration } from '../../utils/metrics';
import { RedisClient } from '../redis';
import type {
  GitLabCommit,
  GitLabCommitDiff,
  GitLabPipeline,
  GitLabMergeRequest,
  GetCommitsOptions,
} from './types';

export class GitLabClient {
  private readonly client: AxiosInstance;
  private readonly redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;

    if (!config.gitlab.token) {
      throw new ExternalAPIError('GitLab', 'Missing GitLab token');
    }

    this.client = axios.create({
      baseURL: config.gitlab.url,
      headers: {
        'PRIVATE-TOKEN': config.gitlab.token,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.client.interceptors.response.use(
      (response) => {
        externalApiCalls.inc({ service: 'gitlab', status: 'success' });
        return response;
      },
      (error) => {
        externalApiCalls.inc({ service: 'gitlab', status: 'error' });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Encode project path for GitLab API
   */
  private encodeProject(repository: string): string {
    return encodeURIComponent(repository);
  }

  /**
   * Get a specific commit by SHA
   */
  async getCommit(repository: string, sha: string): Promise<GitLabCommit> {
    const cacheKey = `gitlab:commit:${repository}:${sha}`;
    const cached = await this.redis.get(cacheKey, 'repo_metadata');

    if (cached) {
      logger.debug('GitLab commit cache hit', { repository, sha });
      return JSON.parse(cached);
    }

    const timer = externalApiDuration.startTimer({ service: 'gitlab', endpoint: 'commit' });

    try {
      logger.debug('Fetching GitLab commit', { repository, sha });

      const response = await this.client.get(
        `/api/v4/projects/${this.encodeProject(repository)}/repository/commits/${sha}`
      );

      timer();

      const commit: GitLabCommit = {
        sha: response.data.id,
        shortId: response.data.short_id,
        message: response.data.message,
        title: response.data.title,
        author: {
          name: response.data.author_name,
          email: response.data.author_email,
        },
        committedDate: new Date(response.data.committed_date),
        repository,
        webUrl: response.data.web_url,
        stats: {
          additions: response.data.stats?.additions || 0,
          deletions: response.data.stats?.deletions || 0,
          total: response.data.stats?.total || 0,
        },
      };

      await this.redis.setex(cacheKey, config.redis.ttl.repoMetadata, JSON.stringify(commit));

      return commit;
    } catch (error) {
      timer();
      logger.error('Failed to fetch GitLab commit', {
        repository,
        sha,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalAPIError('GitLab', 'Failed to fetch commit', error as Error);
    }
  }

  /**
   * Get commits from a repository
   */
  async getCommits(options: GetCommitsOptions): Promise<GitLabCommit[]> {
    const timer = externalApiDuration.startTimer({ service: 'gitlab', endpoint: 'commits' });

    try {
      logger.debug('Fetching GitLab commits', { repository: options.repository });

      const params: Record<string, string | number> = {
        per_page: options.perPage || 20,
      };

      if (options.since) {
        params.since = options.since.toISOString();
      }
      if (options.until) {
        params.until = options.until.toISOString();
      }
      if (options.path) {
        params.path = options.path;
      }
      if (options.branch) {
        params.ref_name = options.branch;
      }

      const response = await this.client.get(
        `/api/v4/projects/${this.encodeProject(options.repository)}/repository/commits`,
        { params }
      );

      timer();

      const commits: GitLabCommit[] = response.data.map(
        (c: Record<string, unknown>): GitLabCommit => ({
          sha: c.id as string,
          shortId: c.short_id as string,
          message: c.message as string,
          title: c.title as string,
          author: {
            name: c.author_name as string,
            email: c.author_email as string,
          },
          committedDate: new Date(c.committed_date as string),
          repository: options.repository,
          webUrl: c.web_url as string,
          stats: {
            additions: (c.stats as { additions?: number })?.additions || 0,
            deletions: (c.stats as { deletions?: number })?.deletions || 0,
            total: (c.stats as { total?: number })?.total || 0,
          },
        })
      );

      logger.debug('Fetched GitLab commits', {
        repository: options.repository,
        count: commits.length,
      });

      return commits;
    } catch (error) {
      timer();
      logger.error('Failed to fetch GitLab commits', {
        repository: options.repository,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalAPIError('GitLab', 'Failed to fetch commits', error as Error);
    }
  }

  /**
   * Get commit diff
   */
  async getCommitDiff(repository: string, sha: string): Promise<GitLabCommitDiff> {
    const cacheKey = `gitlab:diff:${repository}:${sha}`;
    const cached = await this.redis.get(cacheKey, 'repo_metadata');

    if (cached) {
      logger.debug('GitLab diff cache hit', { repository, sha });
      return JSON.parse(cached);
    }

    const timer = externalApiDuration.startTimer({ service: 'gitlab', endpoint: 'diff' });

    try {
      logger.debug('Fetching GitLab commit diff', { repository, sha });

      const response = await this.client.get(
        `/api/v4/projects/${this.encodeProject(repository)}/repository/commits/${sha}/diff`
      );

      timer();

      const diff: GitLabCommitDiff = {
        commitSha: sha,
        files: response.data.map((f: Record<string, unknown>) => ({
          oldPath: f.old_path as string,
          newPath: f.new_path as string,
          diff: f.diff as string,
          newFile: f.new_file as boolean,
          renamedFile: f.renamed_file as boolean,
          deletedFile: f.deleted_file as boolean,
        })),
      };

      await this.redis.setex(cacheKey, config.redis.ttl.repoMetadata, JSON.stringify(diff));

      return diff;
    } catch (error) {
      timer();
      logger.error('Failed to fetch GitLab diff', {
        repository,
        sha,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalAPIError('GitLab', 'Failed to fetch diff', error as Error);
    }
  }

  /**
   * Get pipeline status for a commit
   */
  async getPipelineForCommit(repository: string, sha: string): Promise<GitLabPipeline | null> {
    const timer = externalApiDuration.startTimer({ service: 'gitlab', endpoint: 'pipelines' });

    try {
      logger.debug('Fetching pipeline for commit', { repository, sha });

      const response = await this.client.get(
        `/api/v4/projects/${this.encodeProject(repository)}/pipelines`,
        {
          params: {
            sha,
            per_page: 1,
          },
        }
      );

      timer();

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const p = response.data[0];
      return {
        id: p.id,
        sha: p.sha,
        ref: p.ref,
        status: p.status,
        webUrl: p.web_url,
        createdAt: new Date(p.created_at),
        finishedAt: p.finished_at ? new Date(p.finished_at) : undefined,
      };
    } catch (error) {
      timer();
      logger.warn('Failed to fetch pipeline (non-critical)', {
        repository,
        sha,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get merge request for a commit
   */
  async getMergeRequestForCommit(
    repository: string,
    sha: string
  ): Promise<GitLabMergeRequest | null> {
    const timer = externalApiDuration.startTimer({ service: 'gitlab', endpoint: 'merge_requests' });

    try {
      logger.debug('Fetching merge request for commit', { repository, sha });

      const response = await this.client.get(
        `/api/v4/projects/${this.encodeProject(repository)}/repository/commits/${sha}/merge_requests`
      );

      timer();

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const mr = response.data[0];
      return {
        id: mr.id,
        iid: mr.iid,
        title: mr.title,
        description: mr.description,
        state: mr.state,
        webUrl: mr.web_url,
        author: {
          name: mr.author.name,
          username: mr.author.username,
        },
        mergedAt: mr.merged_at ? new Date(mr.merged_at) : undefined,
      };
    } catch (error) {
      timer();
      logger.warn('Failed to fetch merge request (non-critical)', {
        repository,
        sha,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
