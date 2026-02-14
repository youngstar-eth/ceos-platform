import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (_config: unknown, handler: Function) => handler,
  RATE_LIMITS: { api: { maxRequests: 100, windowMs: 60000 } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    revenueEpoch: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    revenueClaim: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('GET /api/revenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return revenue epochs', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.revenueEpoch.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'epoch-1', epoch: 1, totalRevenue: '1000' },
    ]);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/revenue');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
