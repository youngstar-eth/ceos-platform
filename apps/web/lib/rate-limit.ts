import { type NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from './redis';

interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Time window in seconds. */
  windowSeconds: number;
  /** Key prefix for Redis. */
  prefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding window rate limiter backed by Redis.
 *
 * Uses a sorted set with timestamps to track requests within
 * a rolling window, which is more accurate than fixed-window
 * counters and avoids the burst problem at window boundaries.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { limit, windowSeconds, prefix = 'rl' } = config;
  const key = `${prefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const redis = getRedisClient();

  // Atomic pipeline: remove old entries, add current, count, set expiry
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now.toString(), `${now}:${Math.random().toString(36).slice(2)}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowSeconds * 1000,
  };
}

/**
 * Extract a stable identifier from the incoming request.
 *
 * Priority: authenticated user ID → wallet address → IP address.
 */
export function getRequestIdentifier(request: NextRequest): string {
  // Authenticated user (from session/JWT)
  const userId = request.headers.get('x-user-id');
  if (userId) return `user:${userId}`;

  // Wallet address (from wagmi session)
  const wallet = request.headers.get('x-wallet-address');
  if (wallet) return `wallet:${wallet.toLowerCase()}`;

  // Fallback to IP
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  return `ip:${ip}`;
}

/** Standard rate limit tiers used across all API routes. */
export const RATE_LIMITS = {
  /** General API: 100 requests per minute. */
  api: { limit: 100, windowSeconds: 60, prefix: 'rl:api' },
  /** Deploy operations: 5 per hour (expensive on-chain tx). */
  deploy: { limit: 5, windowSeconds: 3600, prefix: 'rl:deploy' },
  /** Content generation: 30 per minute. */
  content: { limit: 30, windowSeconds: 60, prefix: 'rl:content' },
  /** Auth operations: 10 per minute. */
  auth: { limit: 10, windowSeconds: 60, prefix: 'rl:auth' },
  /** Webhook endpoints: 200 per minute. */
  webhook: { limit: 200, windowSeconds: 60, prefix: 'rl:webhook' },
} as const satisfies Record<string, RateLimitConfig>;

/**
 * Higher-order function that wraps an API route handler with rate limiting.
 *
 * Usage:
 * ```ts
 * export const POST = withRateLimit(RATE_LIMITS.deploy, async (req) => {
 *   // handler logic
 * });
 * ```
 */
export function withRateLimit(
  config: RateLimitConfig,
  handler: (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse>,
) {
  return async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const identifier = getRequestIdentifier(request);
    const result = await checkRateLimit(identifier, config);

    if (!result.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': config.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
          },
        },
      );
    }

    const response = await handler(request, context);
    response.headers.set('X-RateLimit-Limit', config.limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(result.resetAt).toISOString());
    return response;
  };
}

// ---------------------------------------------------------------------------
// Backwards-compatible exports for existing API routes that use the old API.
//
// The old in-memory RateLimiter used a synchronous `.check(key)` method that
// threw AppError on limit exceeded. We preserve this interface but back it
// with an in-memory Map so existing call-sites keep working without needing
// async refactors. New code should use `withRateLimit` or `checkRateLimit`.
// ---------------------------------------------------------------------------

import { Errors } from '@/lib/errors';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): void {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    entry.count += 1;

    if (entry.count > this.maxRequests) {
      throw Errors.rateLimited();
    }
  }

  remaining(key: string): number {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.resetAt) return this.maxRequests;
    return Math.max(0, this.maxRequests - entry.count);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

export const publicLimiter = new RateLimiter(100, 60_000);
export const authenticatedLimiter = new RateLimiter(300, 60_000);
export const webhookLimiter = new RateLimiter(1000, 60_000);

/**
 * Extract a rate-limit key from the request (IP-based).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
