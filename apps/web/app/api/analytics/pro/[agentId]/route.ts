import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Params Schema
// ---------------------------------------------------------------------------

const agentIdSchema = z
  .string()
  .min(1, 'Agent ID is required.')
  .max(128, 'Agent ID is too long.');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProAnalyticsData {
  agentId: string;
  overview: {
    totalCasts: number;
    totalLikes: number;
    totalRecasts: number;
    totalReplies: number;
    followerCount: number;
    engagementRate: number;
    creatorScore: number;
  };
  timeSeries: {
    period: string;
    casts: number;
    likes: number;
    recasts: number;
    replies: number;
    engagementRate: number;
  }[];
  topCasts: {
    hash: string;
    text: string;
    likes: number;
    recasts: number;
    replies: number;
    timestamp: string;
  }[];
  audienceInsights: {
    topFollowerLocations: { location: string; count: number }[];
    activeHours: { hour: number; engagementScore: number }[];
    growthRate: {
      daily: number;
      weekly: number;
      monthly: number;
    };
  };
  revenueMetrics: {
    totalEarned: string;
    claimable: string;
    claimed: string;
    epochBreakdown: {
      epoch: number;
      earned: string;
      creatorScore: number;
    }[];
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/analytics/pro/[agentId]
 *
 * Premium analytics endpoint (x402-gated).
 *
 * Provides detailed metrics, historical time-series data, audience insights,
 * and revenue breakdowns for a specific agent.
 *
 * This endpoint is behind the x402 middleware. By the time the request
 * reaches this handler, payment has already been verified.
 *
 * Headers set by middleware:
 *   - X-PAYMENT-VERIFIED: "true"
 *   - X-PAYMENT-PAYER: wallet address of the payer
 *   - X-PAYMENT-AMOUNT: amount paid in USDC micro-units
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

    // TODO: Replace with actual Prisma + on-chain data aggregation
    // const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    // if (!agent) { return 404; }
    // const metrics = await aggregateMetrics(agentId, timeRange);

    // Generate time series periods based on range
    const periodCount = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const timeSeries = Array.from({ length: periodCount }, (_, i) => ({
      period: new Date(Date.now() - (periodCount - i) * (timeRange === '24h' ? 3_600_000 : 86_400_000)).toISOString(),
      casts: 0,
      likes: 0,
      recasts: 0,
      replies: 0,
      engagementRate: 0,
    }));

    const analytics: ProAnalyticsData = {
      agentId,
      overview: {
        totalCasts: 0,
        totalLikes: 0,
        totalRecasts: 0,
        totalReplies: 0,
        followerCount: 0,
        engagementRate: 0,
        creatorScore: 0,
      },
      timeSeries,
      topCasts: [],
      audienceInsights: {
        topFollowerLocations: [],
        activeHours: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          engagementScore: 0,
        })),
        growthRate: {
          daily: 0,
          weekly: 0,
          monthly: 0,
        },
      },
      revenueMetrics: {
        totalEarned: '0',
        claimable: '0',
        claimed: '0',
        epochBreakdown: [],
      },
    };

    return NextResponse.json(
      {
        success: true,
        data: analytics,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
