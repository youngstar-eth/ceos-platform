import { Errors } from "@/lib/errors";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * For production deployments, replace with Redis-backed implementation.
 */
class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check whether the given key has exceeded the rate limit.
   * Throws AppError with 429 status if exceeded.
   */
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

  /**
   * Return remaining requests for the key. Returns -1 if no record.
   */
  remaining(key: string): number {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.resetAt) return this.maxRequests;
    return Math.max(0, this.maxRequests - entry.count);
  }

  /**
   * Periodic cleanup of expired entries to prevent memory leaks.
   * Call this on an interval in long-running processes.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Pre-configured rate limiters matching the spec:
 * - public: 100 req/min per IP
 * - authenticated: 300 req/min per wallet
 * - webhook: 1000 req/min (Neynar)
 */
export const publicLimiter = new RateLimiter(100, 60_000);
export const authenticatedLimiter = new RateLimiter(300, 60_000);
export const webhookLimiter = new RateLimiter(1000, 60_000);

/**
 * Extract a rate-limit key from the request (IP-based).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
