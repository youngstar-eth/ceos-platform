import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// Mock redis
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => ({
    ping: vi.fn(() => Promise.resolve('PONG')),
  }),
}));

// Mock fetch for neynar and base RPC checks
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it('should return 200 with all checks ok', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.redis.status).toBe('ok');
    expect(typeof body.checks.database.latencyMs).toBe('number');
  });

  it('should return 503 when database is down', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('down');
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.error).toBeDefined();
  });

  it('should return 200 degraded when redis fails but db works', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);

    // Mock redis to fail
    vi.doMock('@/lib/redis', () => ({
      getRedisClient: () => ({
        ping: vi.fn(() => Promise.reject(new Error('Redis down'))),
      }),
    }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.timestamp).toBeDefined();
  });

  it('should include version and uptime', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(body.version).toBeDefined();
    expect(typeof body.uptime).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  it('should set Cache-Control: no-store', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
