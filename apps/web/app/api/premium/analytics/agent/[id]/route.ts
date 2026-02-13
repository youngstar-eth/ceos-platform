import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";
import { getTierForScore } from "@openclaw/shared/types/ceos-score";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.05 in USDC */
const PRICE_USDC = "$0.05";

/** Number of past epochs to include in the trend */
const TREND_EPOCHS = 4;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const agentIdSchema = z
  .string()
  .min(1, "Agent ID is required")
  .max(128, "Agent ID is too long");

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface ScoreDimension {
  trading: number;
  engagement: number;
  revenue: number;
  quality: number;
  reliability: number;
}

interface EpochScore {
  epoch: number;
  totalScore: number;
  tier: number;
  dimensions: ScoreDimension;
}

interface EpochTradingMetric {
  epoch: number;
  volume: number;
  pnl: number;
  winRate: number;
  sharpeRatio: number;
  tradeCount: number;
}

interface AgentAnalyticsData {
  agentId: string;
  agentName: string;
  pfpUrl: string | null;
  currentScore: EpochScore | null;
  trend: EpochScore[];
  tradingHistory: EpochTradingMetric[];
  generatedAt: string;
}

interface AgentAnalyticsResponse {
  success: true;
  data: AgentAnalyticsData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the agent ID from the request URL pathname.
 * Expected path: /api/premium/analytics/agent/[id]
 */
function extractAgentId(request: NextRequest): string {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/");
  // Path: /api/premium/analytics/agent/{id}
  // segments: ["", "api", "premium", "analytics", "agent", "{id}"]
  const id = segments[segments.length - 1];
  if (!id) {
    throw Errors.badRequest("Agent ID is required in the URL path");
  }
  return id;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/premium/analytics/agent/[id]
 *
 * x402-gated ($0.05 USDC). Returns detailed analytics for a single agent
 * including a 4-epoch CEOS Score trend, per-dimension breakdowns, and
 * trading metrics history.
 */
async function handler(request: NextRequest): Promise<NextResponse<AgentAnalyticsResponse>> {
  try {
    // Extract and validate agent ID from URL
    const rawId = extractAgentId(request);
    const parseResult = agentIdSchema.safeParse(rawId);
    if (!parseResult.success) {
      throw Errors.badRequest(
        parseResult.error.issues.map((i) => i.message).join("; "),
      );
    }

    const agentId = parseResult.data;

    // Verify agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, pfpUrl: true },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    // Determine latest epoch for this agent
    const latestScore = await prisma.cEOSScore.findFirst({
      where: { agentId },
      orderBy: { epoch: "desc" },
      select: { epoch: true },
    });

    if (!latestScore) {
      return NextResponse.json({
        success: true as const,
        data: {
          agentId: agent.id,
          agentName: agent.name,
          pfpUrl: agent.pfpUrl ?? null,
          currentScore: null,
          trend: [],
          tradingHistory: [],
          generatedAt: new Date().toISOString(),
        },
      });
    }

    const currentEpoch = latestScore.epoch;
    const startEpoch = Math.max(1, currentEpoch - TREND_EPOCHS + 1);

    // Fetch CEOS Scores for the trend window
    const scores = await prisma.cEOSScore.findMany({
      where: {
        agentId,
        epoch: { gte: startEpoch, lte: currentEpoch },
      },
      orderBy: { epoch: "asc" },
    });

    // Fetch trading metrics for the same window
    const tradingMetrics = await prisma.tradingMetric.findMany({
      where: {
        agentId,
        epoch: { gte: startEpoch, lte: currentEpoch },
      },
      orderBy: { epoch: "asc" },
    });

    // Map scores to response shapes
    const trend: EpochScore[] = scores.map((s) => ({
      epoch: s.epoch,
      totalScore: s.totalScore,
      tier: getTierForScore(s.totalScore),
      dimensions: {
        trading: s.trading,
        engagement: s.engagement,
        revenue: s.revenue,
        quality: s.quality,
        reliability: s.reliability,
      },
    }));

    const tradingHistory: EpochTradingMetric[] = tradingMetrics.map((t) => ({
      epoch: t.epoch,
      volume: t.volume,
      pnl: t.pnl,
      winRate: t.winRate,
      sharpeRatio: t.sharpeRatio,
      tradeCount: t.tradeCount,
    }));

    // Current score is the latest entry in trend
    const currentScore = trend.length > 0 ? trend[trend.length - 1] ?? null : null;

    logger.info(
      { agentId, epochs: trend.length },
      "Premium agent analytics served",
    );

    return NextResponse.json({
      success: true as const,
      data: {
        agentId: agent.id,
        agentName: agent.name,
        pfpUrl: agent.pfpUrl ?? null,
        currentScore,
        trend,
        tradingHistory,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error({ err }, "Error serving premium agent analytics");
    return NextResponse.json(
      { success: false as const, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    ) as NextResponse<AgentAnalyticsResponse>;
  }
}

export const GET = withX402(
  handler,
  process.env.CEOS_REVENUE_ADDRESS! as `0x${string}`,
  {
    price: PRICE_USDC,
    network: "base",
    config: {
      description: "Detailed agent analytics with trend data ($0.05 USDC)",
    },
  },
  {
    url: "https://x402.org/facilitator",
  },
);
