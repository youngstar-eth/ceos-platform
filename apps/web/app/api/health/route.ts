import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

interface CheckResult {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
}

interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  checks: Record<string, CheckResult>;
  uptime: number;
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const checks: Record<string, CheckResult> = {};

  // Database check
  const dbStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Math.round(performance.now() - dbStart) };
  } catch (err) {
    checks.database = {
      status: 'error',
      latencyMs: Math.round(performance.now() - dbStart),
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Redis check
  const redisStart = performance.now();
  try {
    const { getRedisClient } = await import('@/lib/redis');
    const client = getRedisClient();
    await client.ping();
    checks.redis = { status: 'ok', latencyMs: Math.round(performance.now() - redisStart) };
  } catch (err) {
    checks.redis = {
      status: 'error',
      latencyMs: Math.round(performance.now() - redisStart),
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Neynar API check
  const neynarStart = performance.now();
  try {
    const res = await fetch('https://api.neynar.com/v2/farcaster/user/bulk?fids=1', {
      headers: { api_key: process.env.NEYNAR_API_KEY ?? '' },
      signal: AbortSignal.timeout(5000),
    });
    checks.neynar = {
      status: res.ok ? 'ok' : 'error',
      latencyMs: Math.round(performance.now() - neynarStart),
      ...(!res.ok && { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    checks.neynar = {
      status: 'error',
      latencyMs: Math.round(performance.now() - neynarStart),
      error: err instanceof Error ? err.message : 'Timeout',
    };
  }

  // Base RPC check
  const rpcStart = performance.now();
  try {
    const res = await fetch(process.env.BASE_RPC_URL ?? 'https://mainnet.base.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    checks.baseRpc = {
      status: res.ok ? 'ok' : 'error',
      latencyMs: Math.round(performance.now() - rpcStart),
      ...(!res.ok && { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    checks.baseRpc = {
      status: 'error',
      latencyMs: Math.round(performance.now() - rpcStart),
      error: err instanceof Error ? err.message : 'Timeout',
    };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const dbDown = checks.database?.status === 'error';

  const status: HealthStatus = {
    status: dbDown ? 'down' : allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
    checks,
    uptime: process.uptime(),
  };

  return NextResponse.json(status, {
    status: dbDown ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
