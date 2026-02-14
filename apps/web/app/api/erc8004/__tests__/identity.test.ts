import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (_config: unknown, handler: Function) => handler,
  RATE_LIMITS: { api: { maxRequests: 100, windowMs: 60000 } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    erc8004Identity: {
      findUnique: vi.fn(),
    },
  },
}));

describe('GET /api/erc8004/identity/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return ERC-8004 identity', async () => {
    const { prisma } = await import('@/lib/prisma');
    const mockIdentity = {
      id: 'identity-1',
      agentId: 'agent-1',
      tokenId: 1,
      agentUri: 'https://ceos.run/agents/agent-1',
      agent: { id: 'agent-1', name: 'Test Agent' },
    };
    (prisma.erc8004Identity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockIdentity);

    const { GET } = await import('../../identity/[id]/route');
    const request = new NextRequest('http://localhost/api/erc8004/identity/identity-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'identity-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should return 404 for unregistered agent', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.erc8004Identity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import('../../identity/[id]/route');
    const request = new NextRequest('http://localhost/api/erc8004/identity/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
  });
});
