import axios, { AxiosInstance } from 'axios';
import { config } from '../../../config';
import { ExternalAPIError } from '../../utils/errors';
import logger from '../../utils/logger';
import { externalApiCalls, externalApiDuration } from '../../utils/metrics';
import { RedisClient } from '../redis';
import { SEARCH_QUERY, FILE_CONTENT_QUERY } from './queries';
import type {
  SourcegraphSearchQuery,
  SourcegraphSearchResult,
  SourcegraphMatch,
  SourcegraphFile,
} from './types';

export class SourcegraphClient {
  private readonly client: AxiosInstance;
  private readonly redis: RedisClient;
  private readonly maxResults: number;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.maxResults = config.sourcegraph.maxResults;

    if (!config.sourcegraph.token) {
      throw new ExternalAPIError('Sourcegraph', 'Missing Sourcegraph token');
    }

    this.client = axios.create({
      baseURL: config.sourcegraph.url,
      headers: {
        Authorization: `token ${config.sourcegraph.token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.client.interceptors.response.use(
      (response) => {
        externalApiCalls.inc({ service: 'sourcegraph', status: 'success' });
        return response;
      },
      (error) => {
        externalApiCalls.inc({ service: 'sourcegraph', status: 'error' });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Build search query string
   */
  private buildQueryString(options: SourcegraphSearchQuery): string {
    let query = options.pattern;

    if (options.repositories && options.repositories.length > 0) {
      query += ` repo:^(${options.repositories.map((r) => r.replace(/\//g, '\\/')).join('|')})$`;
    }

    if (options.excludeTests) {
      query += ' -file:test -file:spec -file:__tests__ -file:_test.go -file:_test.ts';
    }

    if (options.filePatterns && options.filePatterns.length > 0) {
      query += ` file:(${options.filePatterns.join('|')})`;
    }

    return query;
  }

  /**
   * Search code across repositories
   */
  async search(options: SourcegraphSearchQuery): Promise<SourcegraphSearchResult> {
    const queryString = this.buildQueryString(options);
    const cacheKey = `sourcegraph:search:${Buffer.from(queryString).toString('base64').slice(0, 100)}`;

    const cached = await this.redis.get(cacheKey, 'sourcegraph');
    if (cached) {
      logger.debug('Sourcegraph search cache hit', { pattern: options.pattern });
      return JSON.parse(cached);
    }

    const timer = externalApiDuration.startTimer({ service: 'sourcegraph', endpoint: 'search' });

    try {
      logger.debug('Executing Sourcegraph search', { query: queryString });

      const response = await this.client.post('/.api/graphql', {
        query: SEARCH_QUERY,
        variables: { query: queryString },
      });

      timer();

      if (response.data.errors) {
        throw new Error(response.data.errors[0]?.message || 'GraphQL error');
      }

      const searchResults = response.data.data?.search?.results;

      if (!searchResults) {
        return {
          affectedRepositories: 0,
          totalMatchCount: 0,
          criticalPaths: [],
          matches: [],
        };
      }

      const matches: SourcegraphMatch[] = [];
      const repositorySet = new Set<string>();
      const pathSet = new Set<string>();

      for (const result of searchResults.results || []) {
        if (result.repository && result.file) {
          const repoName = result.repository.name;
          repositorySet.add(repoName);

          for (const lineMatch of result.lineMatches || []) {
            matches.push({
              repository: repoName,
              filePath: result.file.path,
              lineNumber: lineMatch.lineNumber,
              preview: lineMatch.preview,
              matchCount: 1,
            });

            // Track critical paths (files with multiple matches)
            const pathKey = `${repoName}:${result.file.path}`;
            pathSet.add(pathKey);
          }
        }
      }

      const searchResult: SourcegraphSearchResult = {
        affectedRepositories: searchResults.repositoriesCount || repositorySet.size,
        totalMatchCount: searchResults.matchCount || matches.length,
        criticalPaths: Array.from(pathSet).slice(0, 10),
        matches: matches.slice(0, options.maxResults || this.maxResults),
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(searchResult));

      logger.debug('Sourcegraph search completed', {
        pattern: options.pattern,
        matchCount: searchResult.totalMatchCount,
        repositories: searchResult.affectedRepositories,
      });

      return searchResult;
    } catch (error) {
      timer();
      logger.error('Sourcegraph search failed', {
        pattern: options.pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalAPIError('Sourcegraph', 'Search failed', error as Error);
    }
  }

  /**
   * Get file content from a repository
   */
  async getFileContent(repository: string, path: string): Promise<SourcegraphFile | null> {
    const cacheKey = `sourcegraph:file:${repository}:${path}`;

    const cached = await this.redis.get(cacheKey, 'sourcegraph');
    if (cached) {
      logger.debug('Sourcegraph file cache hit', { repository, path });
      return JSON.parse(cached);
    }

    const timer = externalApiDuration.startTimer({ service: 'sourcegraph', endpoint: 'file' });

    try {
      logger.debug('Fetching file content', { repository, path });

      const response = await this.client.post('/.api/graphql', {
        query: FILE_CONTENT_QUERY,
        variables: { repository, path },
      });

      timer();

      if (response.data.errors) {
        throw new Error(response.data.errors[0]?.message || 'GraphQL error');
      }

      const fileData = response.data.data?.repository?.commit?.file;

      if (!fileData) {
        return null;
      }

      const file: SourcegraphFile = {
        repository,
        path,
        content: fileData.content,
        language: fileData.language || 'unknown',
      };

      await this.redis.setex(cacheKey, config.redis.ttl.repoMetadata, JSON.stringify(file));

      return file;
    } catch (error) {
      timer();
      logger.warn('Failed to fetch file content (non-critical)', {
        repository,
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
