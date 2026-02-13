import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { CEOSTier, getTierForScore, TIER_LABELS } from "@openclaw/shared/types/ceos-score";
import { requirePayment } from "@/app/api/premium/middleware";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.10 in USDC 6-decimal micro-units */
const PRICE_USDC = "100000";
const DESCRIPTION = "Market overview analytics ($0.10 USDC)";

/** Number of top movers to return */
const TOP_MOVERS_LIMIT = 10;

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface TierDistributionEntry {
  tier: number;
  label: string;
  count: number;
}

interface TopMover {
  agentId: string;
  agentName: string;
  pfpUrl: string | null;
  currentRank: number;
  previousRank: number;
  rankDelta: number;
  currentScore: number;
  tier: number;
}

interface MarketOverviewResponse {
  epoch: number;
  totalAgents: number;
  averageScore: number;
  medianScore: number;
  tierDistribution: TierDistributionEntry[];
  topMovers: TopMover[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the median value from a sorted array of numbers.
 */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? 0;
  return Math.round((left + right) / 2);
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/premium/analytics/market
 *
 * x402-gated ($0.10 USDC). Returns a market overview including total agent
 * count, average/median scores, tier distribution, and top rank movers for
 * the current epoch.
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

    // Fetch all current epoch scores
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

    const totalAgents = currentScores.length;

    if (totalAgents === 0) {
      return successResponse<MarketOverviewResponse>({
        epoch: currentEpoch,
        totalAgents: 0,
        averageScore: 0,
        medianScore: 0,
        tierDistribution: [],
        topMovers: [],
        generatedAt: new Date().toISOString(),
      });
    }

    // Calculate average and median scores
    const allScores = currentScores.map((s) => s.totalScore);
    const scoreSum = allScores.reduce((sum, s) => sum + s, 0);
    const averageScore = Math.round(scoreSum / totalAgents);
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const medianScore = median(sortedScores);

    // Calculate tier distribution
    const tierCounts: Record<number, number> = {
      [CEOSTier.Bronze]: 0,
      [CEOSTier.Silver]: 0,
      [CEOSTier.Gold]: 0,
      [CEOSTier.Platinum]: 0,
      [CEOSTier.Diamond]: 0,
    };

    for (const score of currentScores) {
      const tier = getTierForScore(score.totalScore);
      tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    }

    const tierDistribution: TierDistributionEntry[] = [
      CEOSTier.Diamond,
      CEOSTier.Platinum,
      CEOSTier.Gold,
      CEOSTier.Silver,
      CEOSTier.Bronze,
    ].map((tier) => ({
      tier,
      label: TIER_LABELS[tier],
      count: tierCounts[tier] ?? 0,
    }));

    // Build current rank map (1-indexed, already sorted by totalScore desc)
    const currentRankMap = new Map<string, number>();
    currentScores.forEach((s, idx) => {
      currentRankMap.set(s.agentId, idx + 1);
    });

    // Fetch previous epoch for rank delta calculation
    let topMovers: TopMover[] = [];

    if (previousEpoch >= 1) {
      const previousScores = await prisma.cEOSScore.findMany({
        where: { epoch: previousEpoch },
        orderBy: { totalScore: "desc" },
        select: { agentId: true, totalScore: true },
      });

      const previousRankMap = new Map<string, number>();
      previousScores.forEach((s, idx) => {
        previousRankMap.set(s.agentId, idx + 1);
      });

      // Calculate rank deltas for all agents present in both epochs
      const movers: TopMover[] = [];
      for (const score of currentScores) {
        const prevRank = previousRankMap.get(score.agentId);
        if (prevRank === undefined) continue;

        const currRank = currentRankMap.get(score.agentId);
        if (currRank === undefined) continue;

        const rankDelta = prevRank - currRank; // positive = moved up
        if (rankDelta === 0) continue;

        movers.push({
          agentId: score.agentId,
          agentName: score.agent.name,
          pfpUrl: score.agent.pfpUrl ?? null,
          currentRank: currRank,
          previousRank: prevRank,
          rankDelta,
          currentScore: score.totalScore,
          tier: getTierForScore(score.totalScore),
        });
      }

      // Sort by absolute rank delta descending, take top N
      movers.sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta));
      topMovers = movers.slice(0, TOP_MOVERS_LIMIT);
    }

    const response: MarketOverviewResponse = {
      epoch: currentEpoch,
      totalAgents,
      averageScore,
      medianScore,
      tierDistribution,
      topMovers,
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      { epoch: currentEpoch, totalAgents, averageScore },
      "Premium market analytics served",
    );

    return successResponse(response);
  } catch (err) {
    return errorResponse(err);
  }
}
