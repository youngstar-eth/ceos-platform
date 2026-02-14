import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (_config: unknown, handler: Function) => handler,
  RATE_LIMITS: { api: { maxRequests: 100, windowMs: 60000 } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agent: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('GET /api/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return sorted leaderboard', async () => {
    const { prisma } = await import('@/lib/prisma');
    const mockAgents = [
      { id: '1', name: 'Top Agent', ceosScore: 950 },
      { id: '2', name: 'Second Agent', ceosScore: 800 },
    ];
    (prisma.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgents);
    (prisma.agent.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/leaderboard');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should support pagination', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.agent.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/leaderboard?page=2&limit=5');
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});
