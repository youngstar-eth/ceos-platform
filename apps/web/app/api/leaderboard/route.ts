export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { getTierForScore, type LeaderboardEntry, type LeaderboardResponse } from "@ceosrun/shared/types";

const querySchema = z.object({
  epoch: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  tier: z.coerce.number().int().min(0).max(4).optional(),
  sortBy: z.enum(["totalScore", "trading", "engagement", "revenue", "quality", "reliability"]).default("totalScore"),
});

/**
 * GET /api/leaderboard
 *
 * Public leaderboard endpoint. Returns ranked agents by CEOS Score.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = querySchema.parse(params);

    // Determine epoch: use provided or find latest
    let epoch = query.epoch;
    if (!epoch) {
      const latest = await prisma.cEOSScore.findFirst({
        orderBy: { epoch: "desc" },
        select: { epoch: true },
      });
      epoch = latest?.epoch ?? 1;
    }

    // Build where clause
    const where: Record<string, unknown> = { epoch };
    if (query.tier !== undefined) {
      where.tier = query.tier;
    }

    // Fetch scores with agent data
    const [scores, totalAgents] = await Promise.all([
      prisma.cEOSScore.findMany({
        where,
        orderBy: { [query.sortBy]: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              onChainAddress: true,
              pfpUrl: true,
            },
          },
        },
      }),
      prisma.cEOSScore.count({ where }),
    ]);

    // Fetch previous epoch scores for rank delta
    const prevEpoch = epoch - 1;
    const agentIds = scores.map((s) => s.agentId);
    const prevScores = prevEpoch > 0
      ? await prisma.cEOSScore.findMany({
          where: { epoch: prevEpoch, agentId: { in: agentIds } },
          orderBy: { totalScore: "desc" },
          select: { agentId: true, totalScore: true },
        })
      : [];

    const prevRankMap = new Map<string, number>();
    prevScores.forEach((s, idx) => {
      prevRankMap.set(s.agentId, idx + 1);
    });

    // Fetch trading metrics for current epoch
    const tradingMetrics = await prisma.tradingMetric.findMany({
      where: { epoch, agentId: { in: agentIds } },
    });
    const tradingMap = new Map(tradingMetrics.map((t) => [t.agentId, t]));

    // Build leaderboard entries
    const baseRank = (query.page - 1) * query.limit;
    const entries: LeaderboardEntry[] = scores.map((s, idx) => {
      const currentRank = baseRank + idx + 1;
      const prevRank = prevRankMap.get(s.agentId);
      const rankDelta = prevRank ? prevRank - currentRank : 0;
      const tm = tradingMap.get(s.agentId);

      return {
        rank: currentRank,
        agentId: s.agentId,
        agentName: s.agent.name,
        agentAddress: s.agent.onChainAddress ?? "",
        pfpUrl: s.agent.pfpUrl ?? null,
        score: {
          trading: s.trading,
          engagement: s.engagement,
          revenue: s.revenue,
          quality: s.quality,
          reliability: s.reliability,
          totalScore: s.totalScore,
          tier: getTierForScore(s.totalScore),
        },
        tradingMetrics: tm
          ? {
              agentId: tm.agentId,
              epoch: tm.epoch,
              volume: tm.volume,
              pnl: tm.pnl,
              winRate: tm.winRate,
              sharpeRatio: tm.sharpeRatio,
              tradeCount: tm.tradeCount,
            }
          : null,
        rankDelta,
      };
    });

    const response: LeaderboardResponse = {
      epoch,
      entries,
      totalAgents,
    };

    logger.info({ epoch, page: query.page, count: entries.length }, "Leaderboard fetched");

    return successResponse(response);
  } catch (err) {
    return errorResponse(err);
  }
}