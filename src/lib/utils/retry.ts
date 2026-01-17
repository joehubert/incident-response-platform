import logger from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error) => boolean;
}

export class RetryStrategy {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffMultiplier: number;
  private readonly shouldRetry: (error: Error) => boolean;

  constructor(options: RetryOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 10000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.shouldRetry = options.shouldRetry ?? (() => true);
  }

  async execute<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.maxRetries || !this.shouldRetry(lastError)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);

        logger.warn('Operation failed, retrying', {
          context,
          attempt,
          maxRetries: this.maxRetries,
          delayMs: delay,
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.baseDelayMs * Math.pow(this.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);

    // Add jitter (±30%)
    const jitter = cappedDelay * 0.3 * (Math.random() - 0.5);

    return Math.floor(cappedDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Default retry strategy
export const defaultRetry = new RetryStrategy();
