import logger from './logger';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? 60000; // 60 seconds
    this.name = options.name ?? 'unnamed';
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }

      // Transition to half-open
      this.state = 'half-open';
      this.successes = 0;
      logger.info(`Circuit breaker '${this.name}' transitioning to HALF-OPEN`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;

      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
        logger.info(`Circuit breaker '${this.name}' closed after successful recovery`);
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.timeout;

      logger.error(`Circuit breaker '${this.name}' opened`, {
        failures: this.failures,
        threshold: this.failureThreshold,
        nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    logger.info(`Circuit breaker '${this.name}' manually reset`);
  }
}
