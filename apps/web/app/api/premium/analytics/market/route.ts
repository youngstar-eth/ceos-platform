import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";
import { CEOSTier, getTierForScore, TIER_LABELS } from "@openclaw/shared/types/ceos-score";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.10 in USDC */
const PRICE_USDC = "$0.10";

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

interface MarketOverviewData {
  epoch: number;
  totalAgents: number;
  averageScore: number;
  medianScore: number;
  tierDistribution: TierDistributionEntry[];
  topMovers: TopMover[];
  generatedAt: string;
}

interface MarketOverviewResponse {
  success: true;
  data: MarketOverviewData;
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
async function handler(_request: NextRequest): Promise<NextResponse<MarketOverviewResponse>> {
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
      return NextResponse.json({
        success: true as const,
        data: {
          epoch: currentEpoch,
          totalAgents: 0,
          averageScore: 0,
          medianScore: 0,
          tierDistribution: [],
          topMovers: [],
          generatedAt: new Date().toISOString(),
        },
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

    logger.info(
      { epoch: currentEpoch, totalAgents, averageScore },
      "Premium market analytics served",
    );

    return NextResponse.json({
      success: true as const,
      data: {
        epoch: currentEpoch,
        totalAgents,
        averageScore,
        medianScore,
        tierDistribution,
        topMovers,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error({ err }, "Error serving premium market analytics");
    return NextResponse.json(
      { success: false as const, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    ) as NextResponse<MarketOverviewResponse>;
  }
}

export const GET = withX402(
  handler,
  process.env.CEOS_REVENUE_ADDRESS! as `0x${string}`,
  {
    price: PRICE_USDC,
    network: "base",
    config: {
      description: "Market overview analytics ($0.10 USDC)",
    },
  },
  {
    url: "https://x402.org/facilitator",
  },
);
