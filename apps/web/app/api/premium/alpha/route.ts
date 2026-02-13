import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";
import { getTierForScore } from "@openclaw/shared/types/ceos-score";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.25 in USDC */
const PRICE_USDC = "$0.25";

/** Minimum absolute rank improvement to qualify as an alpha call */
const MIN_RANK_DELTA = 5;

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface AlphaCall {
  agentId: string;
  agentName: string;
  pfpUrl: string | null;
  currentRank: number;
  previousRank: number;
  rankDelta: number;
  currentScore: number;
  previousScore: number;
  scoreDelta: number;
  tier: number;
  pnlSpike: number | null;
  volumeSpike: number | null;
  tradingMetrics: {
    volume: number;
    pnl: number;
    winRate: number;
    sharpeRatio: number;
    tradeCount: number;
  } | null;
}

interface AlphaResponse {
  success: true;
  data: {
    currentEpoch: number;
    previousEpoch: number;
    generatedAt: string;
    alphaCalls: AlphaCall[];
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/premium/alpha
 *
 * x402-gated ($0.25 USDC). Returns "alpha calls" -- agents whose rank has
 * improved by more than 5 positions compared to the previous epoch. Includes
 * PNL and volume spike data so consumers can identify momentum shifts.
 */
async function handler(_request: NextRequest): Promise<NextResponse<AlphaResponse>> {
  try {
    // Determine latest epoch
    const latestScore = await prisma.cEOSScore.findFirst({
      orderBy: { epoch: "desc" },
      select: { epoch: true },
    });

    if (!latestScore) {
      throw Errors.notFound("No CEOS Score epochs available");
    }

    const currentEpoch = latestScore.epoch;
    const previousEpoch = currentEpoch - 1;

    if (previousEpoch < 1) {
      return NextResponse.json({
        success: true as const,
        data: {
          currentEpoch,
          previousEpoch: 0,
          generatedAt: new Date().toISOString(),
          alphaCalls: [],
        },
      });
    }

    // Fetch all current epoch scores ranked by totalScore descending
    const currentScores = await prisma.cEOSScore.findMany({
      where: { epoch: currentEpoch },
      orderBy: { totalScore: "desc" },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            pfpUrl: true,
          },
        },
      },
    });

    // Build current rank map (1-indexed)
    const currentRankMap = new Map<string, number>();
    currentScores.forEach((s, idx) => {
      currentRankMap.set(s.agentId, idx + 1);
    });

    // Fetch all previous epoch scores ranked by totalScore descending
    const previousScores = await prisma.cEOSScore.findMany({
      where: { epoch: previousEpoch },
      orderBy: { totalScore: "desc" },
      select: { agentId: true, totalScore: true },
    });

    // Build previous rank map (1-indexed)
    const previousRankMap = new Map<string, number>();
    const previousScoreMap = new Map<string, number>();
    previousScores.forEach((s, idx) => {
      previousRankMap.set(s.agentId, idx + 1);
      previousScoreMap.set(s.agentId, s.totalScore);
    });

    // Identify agents with rank improvement > MIN_RANK_DELTA
    const alphaAgentIds: string[] = [];
    for (const score of currentScores) {
      const prevRank = previousRankMap.get(score.agentId);
      if (prevRank === undefined) continue; // new agent, no comparison

      const currRank = currentRankMap.get(score.agentId);
      if (currRank === undefined) continue;

      const rankDelta = prevRank - currRank; // positive = improvement
      if (rankDelta > MIN_RANK_DELTA) {
        alphaAgentIds.push(score.agentId);
      }
    }

    // Fetch trading metrics for current and previous epochs
    const [currentTradingMetrics, previousTradingMetrics] = await Promise.all([
      prisma.tradingMetric.findMany({
        where: { epoch: currentEpoch, agentId: { in: alphaAgentIds } },
      }),
      prisma.tradingMetric.findMany({
        where: { epoch: previousEpoch, agentId: { in: alphaAgentIds } },
      }),
    ]);

    const currentTmMap = new Map(
      currentTradingMetrics.map((t) => [t.agentId, t]),
    );
    const previousTmMap = new Map(
      previousTradingMetrics.map((t) => [t.agentId, t]),
    );

    // Build alpha calls
    const alphaCalls: AlphaCall[] = [];
    for (const score of currentScores) {
      if (!alphaAgentIds.includes(score.agentId)) continue;

      const currRank = currentRankMap.get(score.agentId);
      const prevRank = previousRankMap.get(score.agentId);
      const prevScore = previousScoreMap.get(score.agentId);

      if (currRank === undefined || prevRank === undefined || prevScore === undefined) continue;

      const rankDelta = prevRank - currRank;
      const currentTm = currentTmMap.get(score.agentId);
      const previousTm = previousTmMap.get(score.agentId);

      // Calculate PNL and volume spikes (current - previous)
      let pnlSpike: number | null = null;
      let volumeSpike: number | null = null;
      if (currentTm && previousTm) {
        pnlSpike = currentTm.pnl - previousTm.pnl;
        volumeSpike = currentTm.volume - previousTm.volume;
      }

      alphaCalls.push({
        agentId: score.agentId,
        agentName: score.agent.name,
        pfpUrl: score.agent.pfpUrl ?? null,
        currentRank: currRank,
        previousRank: prevRank,
        rankDelta,
        currentScore: score.totalScore,
        previousScore: prevScore,
        scoreDelta: score.totalScore - prevScore,
        tier: getTierForScore(score.totalScore),
        pnlSpike,
        volumeSpike,
        tradingMetrics: currentTm
          ? {
              volume: currentTm.volume,
              pnl: currentTm.pnl,
              winRate: currentTm.winRate,
              sharpeRatio: currentTm.sharpeRatio,
              tradeCount: currentTm.tradeCount,
            }
          : null,
      });
    }

    // Sort by rank delta descending (biggest movers first)
    alphaCalls.sort((a, b) => b.rankDelta - a.rankDelta);

    logger.info(
      { currentEpoch, previousEpoch, alphaCount: alphaCalls.length },
      "Premium alpha calls served",
    );

    return NextResponse.json({
      success: true as const,
      data: {
        currentEpoch,
        previousEpoch,
        generatedAt: new Date().toISOString(),
        alphaCalls,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error({ err }, "Error serving premium alpha calls");
    return NextResponse.json(
      { success: false as const, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    ) as unknown as NextResponse<AlphaResponse>;
  }
}

export const GET = withX402(
  handler,
  process.env.CEOS_REVENUE_ADDRESS! as `0x${string}`,
  {
    price: PRICE_USDC,
    network: "base",
    config: {
      description: "Alpha calls — agents with significant rank changes ($0.25 USDC)",
    },
  },
  {
    url: "https://x402.org/facilitator",
  },
);
