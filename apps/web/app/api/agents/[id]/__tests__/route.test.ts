import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (_config: unknown, handler: Function) => handler,
  RATE_LIMITS: { api: { maxRequests: 100, windowMs: 60000 } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agent: {
      findUnique: vi.fn(),
    },
  },
}));

describe('GET /api/agents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return agent by id', async () => {
    const { prisma } = await import('@/lib/prisma');
    const mockAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      status: 'ACTIVE',
      persona: 'A helpful agent',
      creatorAddress: '0x123',
      casts: [],
    };
    (prisma.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgent);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents/agent-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'agent-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('agent-1');
  });

  it('should return 404 for non-existent agent', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
  });
});
