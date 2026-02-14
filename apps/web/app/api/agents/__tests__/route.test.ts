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

describe('GET /api/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return paginated list of agents', async () => {
    const { prisma } = await import('@/lib/prisma');
    const mockAgents = [
      { id: '1', name: 'Agent 1', status: 'ACTIVE' },
      { id: '2', name: 'Agent 2', status: 'ACTIVE' },
    ];
    (prisma.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgents);
    (prisma.agent.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents?page=1&limit=10');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should return empty array when no agents', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.agent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.agent.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents');
    const response = await GET(request);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
