import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger
vi.mock('../../config.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { CircuitBreaker, CircuitState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenMaxAttempts: 1,
    });
  });

  it('starts in CLOSED state', () => {
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('stays CLOSED on successful calls', async () => {
    const result = await breaker.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('transitions to OPEN after failure threshold', async () => {
    const failingFn = async () => {
      throw new Error('fail');
    };

    // 3 failures to trigger OPEN
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('rejects calls when OPEN', async () => {
    const failingFn = async () => {
      throw new Error('fail');
    };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    // Next call should be rejected immediately
    await expect(breaker.execute(async () => 'ok')).rejects.toThrow(
      'Circuit breaker "test" is OPEN',
    );
  });

  it('transitions to HALF_OPEN after reset timeout', async () => {
    const failingFn = async () => {
      throw new Error('fail');
    };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 150));

    // Next call should be allowed (HALF_OPEN)
    const result = await breaker.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('returns to OPEN if HALF_OPEN test fails', async () => {
    const failingFn = async () => {
      throw new Error('fail');
    };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 150));

    // HALF_OPEN test fails
    await expect(breaker.execute(failingFn)).rejects.toThrow('fail');
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('can be manually reset', async () => {
    const failingFn = async () => {
      throw new Error('fail');
    };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Manual reset
    breaker.reset();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    // Should work again
    const result = await breaker.execute(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('resets failure count on success', async () => {
    const failingFn = async () => {
      throw new Error('fail');
    };

    // 2 failures (below threshold of 3)
    await expect(breaker.execute(failingFn)).rejects.toThrow();
    await expect(breaker.execute(failingFn)).rejects.toThrow();

    // 1 success resets the counter
    await breaker.execute(async () => 'ok');

    // 2 more failures should not trip it
    await expect(breaker.execute(failingFn)).rejects.toThrow();
    await expect(breaker.execute(failingFn)).rejects.toThrow();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});
