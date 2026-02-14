import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { getTierForScore } from "@ceosrun/shared/types";
import { requirePayment } from "@/app/api/premium/middleware";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.25 in USDC 6-decimal micro-units */
const PRICE_USDC = "250000";
const DESCRIPTION = "Alpha calls — agents with significant rank changes ($0.25 USDC)";

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
  currentEpoch: number;
  previousEpoch: number;
  generatedAt: string;
  alphaCalls: AlphaCall[];
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/premium/alpha
 *
 * x402-gated ($0.25 USDC). Returns "alpha calls" — agents whose rank has
 * improved by more than 5 positions compared to the previous epoch. Includes
 * PNL and volume spike data so consumers can identify momentum shifts.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    // x402 payment gate
    const paywall = requirePayment(request, PRICE_USDC, DESCRIPTION);
    if (paywall) return paywall;

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
      return successResponse<AlphaResponse>({
        currentEpoch,
        previousEpoch: 0,
        generatedAt: new Date().toISOString(),
        alphaCalls: [],
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

    const response: AlphaResponse = {
      currentEpoch,
      previousEpoch,
      generatedAt: new Date().toISOString(),
      alphaCalls,
    };

    logger.info(
      { currentEpoch, previousEpoch, alphaCount: alphaCalls.length },
      "Premium alpha calls served",
    );

    return successResponse(response);
  } catch (err) {
    return errorResponse(err);
  }
}
