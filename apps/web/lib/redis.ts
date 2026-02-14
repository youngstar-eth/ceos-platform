import Redis from 'ioredis';

let redisClient: Redis | null = null;

/**
 * Return a shared Redis client singleton.
 *
 * Uses lazy connection so importing this module never blocks the
 * event loop — the first command triggers the actual TCP handshake.
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
    });
  }
  return redisClient;
}
