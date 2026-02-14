import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    neynar: 'reachable' | 'unreachable';
    baseRpc: 'reachable' | 'unreachable';
  };
  uptime: number;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const services: HealthStatus['services'] = {
    database: 'disconnected',
    redis: 'disconnected',
    neynar: 'unreachable',
    baseRpc: 'unreachable',
  };

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    services.database = 'connected';
  } catch {
    services.database = 'disconnected';
  }

  // Redis check
  try {
    const { getRedisClient } = await import('@/lib/redis');
    const client = getRedisClient();
    await client.ping();
    services.redis = 'connected';
  } catch {
    services.redis = 'disconnected';
  }

  // Neynar check (lightweight — just check API key validity)
  try {
    const res = await fetch('https://api.neynar.com/v2/farcaster/user/bulk?fids=1', {
      headers: { 'x-api-key': process.env.NEYNAR_API_KEY ?? '' },
      signal: AbortSignal.timeout(3000),
    });
    services.neynar = res.ok ? 'reachable' : 'unreachable';
  } catch {
    services.neynar = 'unreachable';
  }

  // Base RPC check
  try {
    const res = await fetch(process.env.BASE_RPC_URL ?? 'https://mainnet.base.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: AbortSignal.timeout(3000),
    });
    services.baseRpc = res.ok ? 'reachable' : 'unreachable';
  } catch {
    services.baseRpc = 'unreachable';
  }

  const allHealthy = Object.values(services).every(
    (s) => s === 'connected' || s === 'reachable',
  );
  const criticalDown = services.database === 'disconnected';

  const status: HealthStatus = {
    status: criticalDown ? 'down' : allHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
    services,
    uptime: process.uptime(),
  };

  return NextResponse.json(status, {
    status: criticalDown ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
