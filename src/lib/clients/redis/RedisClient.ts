import Redis from 'ioredis';
import { config } from '../../../config';
import { CacheError } from '../../utils/errors';
import logger from '../../utils/logger';
import { cacheHits, cacheMisses } from '../../utils/metrics';

export class RedisClient {
  private client: Redis | null = null;

  constructor() {}

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.client.on('error', (error) => {
        logger.error('Redis error', { error: error.message });
      });

      this.client.on('connect', () => {
        logger.info('Connected to Redis');
      });

      await this.client.ping();
    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to connect to Redis', error as Error);
    }
  }

  /**
   * Get value from cache
   */
  async get(key: string, cacheType: string = 'generic'): Promise<string | null> {
    if (!this.client) {
      throw new CacheError('Redis client not connected');
    }

    try {
      const value = await this.client.get(key);

      if (value !== null) {
        cacheHits.inc({ cache_type: cacheType });
      } else {
        cacheMisses.inc({ cache_type: cacheType });
      }

      return value;
    } catch (error) {
      logger.error('Redis GET error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to get from cache', error as Error);
    }
  }

  /**
   * Set value in cache with TTL
   */
  async setex(key: string, ttl: number, value: string): Promise<void> {
    if (!this.client) {
      throw new CacheError('Redis client not connected');
    }

    try {
      await this.client.setex(key, ttl, value);
    } catch (error) {
      logger.error('Redis SETEX error', {
        key,
        ttl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to set cache', error as Error);
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    if (!this.client) {
      throw new CacheError('Redis client not connected');
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to delete from cache', error as Error);
    }
  }

  /**
   * Ping Redis to check connection
   */
  async ping(): Promise<string> {
    if (!this.client) {
      throw new CacheError('Redis client not connected');
    }

    try {
      return await this.client.ping();
    } catch (error) {
      logger.error('Redis PING error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError('Failed to ping Redis', error as Error);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info('Disconnected from Redis');
    }
  }
}
