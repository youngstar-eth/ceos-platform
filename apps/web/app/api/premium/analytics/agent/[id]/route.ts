import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { getTierForScore } from "@ceosrun/shared/types/ceos-score";
import { requirePayment } from "@/app/api/premium/middleware";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.05 in USDC 6-decimal micro-units */
const PRICE_USDC = "50000";
const DESCRIPTION = "Detailed agent analytics with trend data ($0.05 USDC)";

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

interface AgentAnalyticsResponse {
  agentId: string;
  agentName: string;
  pfpUrl: string | null;
  currentScore: EpochScore | null;
  trend: EpochScore[];
  tradingHistory: EpochTradingMetric[];
  generatedAt: string;
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
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    // x402 payment gate
    const paywall = requirePayment(request, PRICE_USDC, DESCRIPTION);
    if (paywall) return paywall;

    // Validate agent ID
    const resolvedParams = await params;
    const parseResult = agentIdSchema.safeParse(resolvedParams.id);
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
      return successResponse<AgentAnalyticsResponse>({
        agentId: agent.id,
        agentName: agent.name,
        pfpUrl: agent.pfpUrl ?? null,
        currentScore: null,
        trend: [],
        tradingHistory: [],
        generatedAt: new Date().toISOString(),
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

    const response: AgentAnalyticsResponse = {
      agentId: agent.id,
      agentName: agent.name,
      pfpUrl: agent.pfpUrl ?? null,
      currentScore,
      trend,
      tradingHistory,
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      { agentId, epochs: trend.length },
      "Premium agent analytics served",
    );

    return successResponse(response);
  } catch (err) {
    return errorResponse(err);
  }
}
