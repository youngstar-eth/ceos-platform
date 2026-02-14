import pino from 'pino';
import { logger as rootLogger } from '../config.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

/**
 * Circuit Breaker pattern for external API calls.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through.
 * - OPEN: Too many failures; requests are rejected immediately.
 * - HALF_OPEN: After reset timeout, allow a limited number of requests to test recovery.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly logger: pino.Logger;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 2;
    this.logger = rootLogger.child({ module: `CircuitBreaker:${this.name}` });
  }

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime >= this.resetTimeoutMs
      ) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.logger.info({ name: this.name }, 'Circuit transitioned to HALF_OPEN');
      } else {
        this.logger.warn({ name: this.name }, 'Circuit is OPEN, rejecting request');
        throw new Error(`Circuit breaker "${this.name}" is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxAttempts) {
        this.state = CircuitState.CLOSED;
        this.logger.info({ name: this.name }, 'Circuit recovered, transitioning to CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.logger.warn({ name: this.name }, 'HALF_OPEN test failed, circuit OPEN again');
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.logger.warn(
        { name: this.name, failureCount: this.failureCount },
        'Failure threshold exceeded, circuit OPEN',
      );
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.logger.info({ name: this.name }, 'Circuit manually reset to CLOSED');
  }
}
