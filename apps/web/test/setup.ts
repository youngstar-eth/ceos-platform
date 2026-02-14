import '@testing-library/jest-dom/vitest';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
}));

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    isConnected: true,
    isConnecting: false,
    isDisconnected: false,
  }),
  useWalletClient: () => ({ data: null }),
  useReadContract: () => ({ data: undefined, isLoading: false, error: null }),
  useWriteContract: () => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
  }),
  useWaitForTransactionReceipt: () => ({
    data: undefined,
    isLoading: false,
    isSuccess: false,
    error: null,
  }),
}));

// Global Prisma mock
vi.mock('@/lib/prisma', () => {
  const { mockDeep } = require('vitest-mock-extended');
  return { prisma: mockDeep() };
});

// Global Redis mock
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => ({
    ping: vi.fn(() => Promise.resolve('PONG')),
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve('OK')),
    del: vi.fn(() => Promise.resolve(1)),
    pipeline: vi.fn(() => ({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(() => Promise.resolve([[null, 1], [null, 0], [null, 1], [null, 1]])),
    })),
  }),
}));

// Silent logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

// Mock fetch globally
global.fetch = vi.fn();
