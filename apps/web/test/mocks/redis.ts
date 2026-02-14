import { vi } from 'vitest';

const store = new Map<string, string>();

export const redisMock = {
  get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  set: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve('OK');
  }),
  del: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve(1);
  }),
  ping: vi.fn(() => Promise.resolve('PONG')),
  expire: vi.fn(() => Promise.resolve(1)),
  zadd: vi.fn(() => Promise.resolve(1)),
  zcard: vi.fn(() => Promise.resolve(0)),
  zremrangebyscore: vi.fn(() => Promise.resolve(0)),
  pipeline: vi.fn(() => ({
    zadd: vi.fn().mockReturnThis(),
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn(() => Promise.resolve([[null, 1], [null, 0], [null, 1], [null, 1]])),
  })),
};

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => redisMock,
}));

export function clearRedisStore(): void {
  store.clear();
}
