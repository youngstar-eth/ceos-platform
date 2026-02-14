import { PrismaClient } from "@prisma/client";
import {
  calculateCEOSScore,
  calculateTradingScore,
  calculateEngagementScore,
  calculateRevenueScore,
  calculateQualityScore,
  calculateReliabilityScore,
  calculateEpochBenchmarks,
} from "@openclaw/shared/utils/scoring-engine";
import type { CEOSScoreBreakdown } from "@openclaw/shared/types/ceos-score";

const prisma = new PrismaClient();

interface AgentEpochData {
  agentId: string;
  address: string;
  // Trading
  volume: number;
  pnl: number;
  winRate: number;
  sharpeRatio: number;
  // Engagement
  likes: number;
  recasts: number;
  replies: number;
  mentions: number;
  // Revenue
  x402Revenue: number;
  tips: number;
  sponsorship: number;
  // Quality
  aiQuality: number;
  originality: number;
  sentiment: number;
  // Reliability
  uptimePercent: number;
  avgResponseTimeMs: number;
  errorRate: number;
}

/**
 * Process CEOS Score v2 epoch scoring for all active agents.
 *
 * Called by BullMQ worker at epoch end. Gathers metrics, computes
 * per-dimension scores, stores in DB, and returns data for on-chain submission.
 */
export async function processEpochScoring(epoch: number): Promise<{
  agentCount: number;
  scores: Array<{ agentId: string; address: string; breakdown: CEOSScoreBreakdown }>;
}> {
  // 1. Fetch all active agents
  const agents = await prisma.agent.findMany({
    where: { status: "ACTIVE", onChainAddress: { not: null } },
    select: {
      id: true,
      onChainAddress: true,
      metrics: { where: { epoch }, take: 1 },
      tradingMetrics: { where: { epoch }, take: 1 },
    },
  });

  if (agents.length === 0) {
    return { agentCount: 0, scores: [] };
  }

  // 2. Gather raw metrics for each agent
  const agentData: AgentEpochData[] = [];
  for (const agent of agents) {
    const metrics = agent.metrics[0];
    const trading = agent.tradingMetrics[0];

    // Fetch cast engagement for this epoch
    const castAgg = await prisma.cast.aggregate({
      where: { agentId: agent.id },
      _sum: { likes: true, recasts: true, replies: true },
      _count: true,
    });

    // Fetch x402 revenue
    const x402Agg = await prisma.x402Payment.aggregate({
      where: { payer: agent.onChainAddress ?? undefined },
      _sum: { amount: true },
    });

    // Fetch mention count from cast replies targeting this agent
    const mentionCount = await prisma.cast.count({
      where: { agentId: agent.id, type: "REPLY" },
    });

    // Calculate originality: ratio of unique content (ORIGINAL vs RECAST)
    const originalCount = await prisma.cast.count({
      where: { agentId: agent.id, type: "ORIGINAL" },
    });
    const totalCastCount = castAgg._count;
    const originality = totalCastCount > 0
      ? Math.round((originalCount / totalCastCount) * 100)
      : 50;

    // Compute error rate from metrics uptime
    const uptimeVal = metrics?.uptime ?? 95;
    const errorRate = Math.max(0, (100 - uptimeVal) / 100);

    agentData.push({
      agentId: agent.id,
      address: agent.onChainAddress ?? "",
      volume: trading?.volume ?? 0,
      pnl: trading?.pnl ?? 0,
      winRate: trading?.winRate ?? 0,
      sharpeRatio: trading?.sharpeRatio ?? 0,
      likes: castAgg._sum.likes ?? 0,
      recasts: castAgg._sum.recasts ?? 0,
      replies: castAgg._sum.replies ?? 0,
      mentions: mentionCount,
      x402Revenue: Number(x402Agg._sum.amount ?? 0),
      tips: 0,
      sponsorship: 0,
      aiQuality: metrics?.contentQuality ?? 50,
      originality,
      sentiment: 50, // Sentiment analysis deferred to runtime content pipeline
      uptimePercent: uptimeVal,
      avgResponseTimeMs: 500,
      errorRate,
    });
  }

  // 3. Calculate benchmarks
  const benchmarkInput = agentData.map((a) => ({
    volume: a.volume,
    pnl: a.pnl,
    totalEngagement: a.likes + a.recasts * 2 + a.replies * 3,
    totalRevenue: a.x402Revenue + a.tips + a.sponsorship,
    totalScore: 0,
  }));
  const benchmarks = calculateEpochBenchmarks(epoch, benchmarkInput);

  // 4. Calculate per-agent scores
  const results: Array<{ agentId: string; address: string; breakdown: CEOSScoreBreakdown }> = [];

  for (const agent of agentData) {
    const tradingScore = calculateTradingScore({
      volume: agent.volume,
      pnl: agent.pnl,
      winRate: agent.winRate,
      sharpeRatio: agent.sharpeRatio,
      benchmarks: { maxVolume: benchmarks.maxVolume, maxPnl: benchmarks.maxPnl },
    });

    const engagementScore = calculateEngagementScore({
      likes: agent.likes,
      recasts: agent.recasts,
      replies: agent.replies,
      mentions: agent.mentions,
      maxEngagement: benchmarks.maxEngagement,
    });

    const revenueScore = calculateRevenueScore({
      x402Revenue: agent.x402Revenue,
      tips: agent.tips,
      sponsorship: agent.sponsorship,
      maxRevenue: benchmarks.maxRevenue,
    });

    const qualityScore = calculateQualityScore({
      aiQuality: agent.aiQuality,
      originality: agent.originality,
      sentiment: agent.sentiment,
    });

    const reliabilityScore = calculateReliabilityScore({
      uptimePercent: agent.uptimePercent,
      avgResponseTimeMs: agent.avgResponseTimeMs,
      errorRate: agent.errorRate,
    });

    const breakdown = calculateCEOSScore({
      trading: tradingScore,
      engagement: engagementScore,
      revenue: revenueScore,
      quality: qualityScore,
      reliability: reliabilityScore,
    });

    results.push({ agentId: agent.agentId, address: agent.address, breakdown });
  }

  // 5. Batch upsert to DB
  await prisma.$transaction(
    results.map((r) =>
      prisma.cEOSScore.upsert({
        where: { agentId_epoch: { agentId: r.agentId, epoch } },
        create: {
          agentId: r.agentId,
          epoch,
          trading: r.breakdown.trading,
          engagement: r.breakdown.engagement,
          revenue: r.breakdown.revenue,
          quality: r.breakdown.quality,
          reliability: r.breakdown.reliability,
          totalScore: r.breakdown.totalScore,
          tier: r.breakdown.tier,
        },
        update: {
          trading: r.breakdown.trading,
          engagement: r.breakdown.engagement,
          revenue: r.breakdown.revenue,
          quality: r.breakdown.quality,
          reliability: r.breakdown.reliability,
          totalScore: r.breakdown.totalScore,
          tier: r.breakdown.tier,
        },
      })
    )
  );

  return { agentCount: results.length, scores: results };
}
