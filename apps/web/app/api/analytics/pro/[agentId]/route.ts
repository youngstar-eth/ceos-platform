import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Params Schema
// ---------------------------------------------------------------------------

const agentIdSchema = z
  .string()
  .min(1, 'Agent ID is required.')
  .max(128, 'Agent ID is too long.');

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/analytics/pro/[agentId]
 *
 * Premium analytics endpoint (x402-gated).
 *
 * Provides detailed metrics, historical time-series data,
 * and revenue breakdowns for a specific agent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  try {
    // Verify payment (enforced by middleware, but double-check)
    const paymentVerified = request.headers.get('X-PAYMENT-VERIFIED');
    if (paymentVerified !== 'true') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PAYMENT_REQUIRED',
            message: 'This endpoint requires x402 payment for premium analytics.',
          },
        },
        { status: 402 }
      );
    }

    // Validate agent ID
    const resolvedParams = await params;
    const agentIdResult = agentIdSchema.safeParse(resolvedParams.agentId);
    if (!agentIdResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid agent ID.',
            details: agentIdResult.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const agentId = agentIdResult.data;

    // Parse optional query parameters for time range
    const timeRange = request.nextUrl.searchParams.get('range') ?? '7d';
    const validRanges = ['24h', '7d', '30d', '90d'];
    if (!validRanges.includes(timeRange)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid time range. Must be one of: ${validRanges.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    // Verify agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Agent not found.' },
        },
        { status: 404 }
      );
    }

    // Calculate time window
    const rangeMs: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
    };
    const since = new Date(Date.now() - rangeMs[timeRange]);

    // Fetch real data from database
    const [castAggregates, casts, latestMetrics, ceosScores, revenueClaims] = await Promise.all([
      // Aggregate cast metrics in the time range
      prisma.cast.aggregate({
        where: { agentId, publishedAt: { gte: since } },
        _sum: { likes: true, recasts: true, replies: true },
        _count: true,
      }),

      // Get casts for time series and top casts
      prisma.cast.findMany({
        where: { agentId, publishedAt: { gte: since } },
        orderBy: { likes: 'desc' },
        take: 50,
      }),

      // Latest agent metrics
      prisma.agentMetrics.findFirst({
        where: { agentId },
        orderBy: { epoch: 'desc' },
      }),

      // CEOS Scores for revenue breakdown
      prisma.cEOSScore.findMany({
        where: { agentId },
        orderBy: { epoch: 'desc' },
        take: 10,
      }),

      // Revenue claims by the agent's creator
      prisma.revenueClaim.findMany({
        where: { address: agent.creatorAddress },
        orderBy: { epoch: 'desc' },
        take: 10,
      }),
    ]);

    // Build overview
    const totalCasts = castAggregates._count;
    const totalLikes = castAggregates._sum.likes ?? 0;
    const totalRecasts = castAggregates._sum.recasts ?? 0;
    const totalReplies = castAggregates._sum.replies ?? 0;
    const totalEngagement = totalLikes + totalRecasts + totalReplies;
    const engagementRate = totalCasts > 0 ? totalEngagement / totalCasts : 0;

    // Build time series from actual casts
    const periodCount = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const periodMs = timeRange === '24h' ? 3_600_000 : 86_400_000;
    const now = Date.now();

    const timeSeries = Array.from({ length: periodCount }, (_, i) => {
      const periodStart = new Date(now - (periodCount - i) * periodMs);
      const periodEnd = new Date(now - (periodCount - i - 1) * periodMs);

      const periodCasts = casts.filter((c) => {
        const t = c.publishedAt?.getTime() ?? c.createdAt.getTime();
        return t >= periodStart.getTime() && t < periodEnd.getTime();
      });

      const pLikes = periodCasts.reduce((s, c) => s + c.likes, 0);
      const pRecasts = periodCasts.reduce((s, c) => s + c.recasts, 0);
      const pReplies = periodCasts.reduce((s, c) => s + c.replies, 0);
      const pTotal = pLikes + pRecasts + pReplies;

      return {
        period: periodStart.toISOString(),
        casts: periodCasts.length,
        likes: pLikes,
        recasts: pRecasts,
        replies: pReplies,
        engagementRate: periodCasts.length > 0 ? pTotal / periodCasts.length : 0,
      };
    });

    // Top casts (already sorted by likes desc)
    const topCasts = casts.slice(0, 10).map((c) => ({
      hash: c.hash ?? '',
      text: c.content.slice(0, 320),
      likes: c.likes,
      recasts: c.recasts,
      replies: c.replies,
      timestamp: (c.publishedAt ?? c.createdAt).toISOString(),
    }));

    // Active hours from casts
    const hourBuckets = new Array(24).fill(0);
    for (const c of casts) {
      const hour = (c.publishedAt ?? c.createdAt).getUTCHours();
      hourBuckets[hour] += c.likes + c.recasts + c.replies;
    }

    // Revenue
    const totalClaimed = revenueClaims.reduce((s, r) => s + r.amount, 0n);
    const epochBreakdown = ceosScores.map((s) => ({
      epoch: s.epoch,
      earned: '0',
      creatorScore: s.totalScore,
    }));

    const analytics = {
      agentId,
      overview: {
        totalCasts,
        totalLikes,
        totalRecasts,
        totalReplies,
        followerCount: latestMetrics?.followerGrowth ?? 0,
        engagementRate: Math.round(engagementRate * 100) / 100,
        creatorScore: ceosScores[0]?.totalScore ?? 0,
      },
      timeSeries,
      topCasts,
      audienceInsights: {
        topFollowerLocations: [],
        activeHours: hourBuckets.map((score, hour) => ({ hour, engagementScore: score })),
        growthRate: {
          daily: latestMetrics?.followerGrowth ?? 0,
          weekly: (latestMetrics?.followerGrowth ?? 0) * 7,
          monthly: (latestMetrics?.followerGrowth ?? 0) * 30,
        },
      },
      revenueMetrics: {
        totalEarned: totalClaimed.toString(),
        claimable: '0',
        claimed: totalClaimed.toString(),
        epochBreakdown,
      },
    };

    return NextResponse.json(
      { success: true, data: analytics },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      },
      { status: 500 }
    );
  }
}
