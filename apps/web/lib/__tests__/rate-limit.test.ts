import { describe, it, expect, vi, beforeEach } from 'vitest';

// Need to import after mocks are set up
vi.mock('@/lib/redis', () => {
  const pipeline = {
    zadd: vi.fn().mockReturnThis(),
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn(() => Promise.resolve([
      [null, 1],  // zadd result
      [null, 0],  // zremrangebyscore result
      [null, 1],  // zcard result (count=1, within limit)
      [null, 1],  // expire result
    ])),
  };
  return {
    getRedisClient: () => ({
      pipeline: vi.fn(() => pipeline),
    }),
    __pipeline: pipeline,
  };
});

describe('Rate Limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checkRateLimit should allow requests within limit', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    const result = await checkRateLimit('test-key', { maxRequests: 10, windowMs: 60000 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('checkRateLimit should block requests exceeding limit', async () => {
    // Override pipeline exec to return count > limit
    const { __pipeline } = await import('@/lib/redis') as { __pipeline: { exec: ReturnType<typeof vi.fn> } };
    __pipeline.exec.mockResolvedValueOnce([
      [null, 1],
      [null, 0],
      [null, 11],  // count > maxRequests
      [null, 1],
    ]);

    const { checkRateLimit } = await import('@/lib/rate-limit');
    const result = await checkRateLimit('test-key', { maxRequests: 10, windowMs: 60000 });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('getRequestIdentifier should return a string', async () => {
    const { getRequestIdentifier } = await import('@/lib/rate-limit');
    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });

    const id = getRequestIdentifier(request);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
