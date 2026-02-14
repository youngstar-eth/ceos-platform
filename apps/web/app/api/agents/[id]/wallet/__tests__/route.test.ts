import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock rate limit to pass through
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (_config: unknown, handler: Function) => handler,
  RATE_LIMITS: { api: { maxRequests: 100, windowMs: 60000 } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agent: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    walletTransaction: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('GET /api/agents/[id]/wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return wallet status for agent', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      walletAddress: '0xabc123',
      walletEmail: 'test@agents.ceos.run',
      walletSessionLimit: 50,
      walletTxLimit: 10,
      walletAutoFund: false,
      _count: { walletTransactions: 5 },
    });
    (prisma.walletTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { amount: 1.5 },
    });

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents/test-id/wallet');
    const response = await GET(request, { params: Promise.resolve({ id: 'test-id' }) });
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.address).toBe('0xabc123');
    expect(body.data.sessionLimit).toBe(50);
    expect(body.data.transactionCount).toBe(5);
  });

  it('should return 404 for non-existent agent', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents/nonexistent/wallet');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe('PATCH /api/agents/[id]/wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update session and tx limits', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.agent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'test-id' });
    (prisma.agent.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      walletSessionLimit: 100,
      walletTxLimit: 20,
    });

    const { PATCH } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents/test-id/wallet', {
      method: 'PATCH',
      body: JSON.stringify({ sessionLimit: 100, txLimit: 20 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'test-id' }) });
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.sessionLimit).toBe(100);
    expect(body.data.txLimit).toBe(20);
  });

  it('should return 422 on invalid input', async () => {
    const { PATCH } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents/test-id/wallet', {
      method: 'PATCH',
      body: JSON.stringify({ sessionLimit: -5 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'test-id' }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
  });

  it('should validate limits max bounds', async () => {
    const { PATCH } = await import('../route');
    const request = new NextRequest('http://localhost/api/agents/test-id/wallet', {
      method: 'PATCH',
      body: JSON.stringify({ sessionLimit: 9999 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'test-id' }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
  });
});
