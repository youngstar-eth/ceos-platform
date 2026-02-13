import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.10 in USDC 6-decimal micro-units */
const PRICE_USDC = "$0.10";
const SIGNAL_LIMIT = 5;

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface TradingSignal {
  agentId: string;
  agentName: string;
  direction: "bullish" | "bearish";
  confidence: number;
  volume: number;
  pnl: number;
  winRate: number;
  sharpeRatio: number;
  tradeCount: number;
  ceosScore: number;
  tier: number;
}

interface SignalsResponse {
  success: true;
  data: {
    epoch: number;
    generatedAt: string;
    signals: TradingSignal[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a confidence percentage (0-100) from win rate and Sharpe ratio.
 * Win rate contributes 60%, capped Sharpe ratio contributes 40%.
 */
function calculateConfidence(winRate: number, sharpeRatio: number): number {
  const winComponent = Math.min(winRate, 100) * 0.6;
  const sharpeComponent = (Math.min(Math.max(sharpeRatio, 0), 3) / 3) * 100 * 0.4;
  return Math.round(winComponent + sharpeComponent);
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/premium/signals
 *
 * x402-gated ($0.10 USDC). Returns the top 5 trading signals from agents
 * in the current epoch, ranked by trading score. Each signal includes a
 * directional call (bullish/bearish) based on PNL sign and a confidence
 * score derived from win rate and Sharpe ratio.
 */
async function handler(_request: NextRequest): Promise<NextResponse<SignalsResponse>> {
  try {
    // Determine latest epoch
    const latestScore = await prisma.cEOSScore.findFirst({
      orderBy: { epoch: "desc" },
      select: { epoch: true },
    });

    if (!latestScore) {
      throw Errors.notFound("No CEOS Score epochs available");
    }

    const epoch = latestScore.epoch;

    // Fetch top agents by trading score with their trading metrics
    const topTradingScores = await prisma.cEOSScore.findMany({
      where: { epoch },
      orderBy: { trading: "desc" },
      take: SIGNAL_LIMIT,
      include: {
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (topTradingScores.length === 0) {
      return NextResponse.json({
        success: true as const,
        data: {
          epoch,
          generatedAt: new Date().toISOString(),
          signals: [],
        },
      });
    }

    const agentIds = topTradingScores.map((s) => s.agentId);

    // Fetch corresponding trading metrics
    const tradingMetrics = await prisma.tradingMetric.findMany({
      where: { epoch, agentId: { in: agentIds } },
    });

    const tradingMap = new Map(tradingMetrics.map((t) => [t.agentId, t]));

    // Build signal entries
    const signals: TradingSignal[] = topTradingScores
      .map((score) => {
        const tm = tradingMap.get(score.agentId);
        if (!tm) return null;

        return {
          agentId: score.agentId,
          agentName: score.agent.name,
          direction: (tm.pnl >= 0 ? "bullish" : "bearish") as "bullish" | "bearish",
          confidence: calculateConfidence(tm.winRate, tm.sharpeRatio),
          volume: tm.volume,
          pnl: tm.pnl,
          winRate: tm.winRate,
          sharpeRatio: tm.sharpeRatio,
          tradeCount: tm.tradeCount,
          ceosScore: score.totalScore,
          tier: score.tier,
        };
      })
      .filter((s): s is TradingSignal => s !== null);

    logger.info(
      { epoch, signalCount: signals.length },
      "Premium trading signals served",
    );

    return NextResponse.json({
      success: true as const,
      data: {
        epoch,
        generatedAt: new Date().toISOString(),
        signals,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error({ err }, "Error serving premium signals");
    return NextResponse.json(
      { success: false as const, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    ) as unknown as NextResponse<SignalsResponse>;
  }
}

export const GET = withX402(
  handler,
  process.env.CEOS_REVENUE_ADDRESS! as `0x${string}`,
  {
    price: PRICE_USDC,
    network: "base",
    config: {
      description: "Top trading signals for the current epoch ($0.10 USDC)",
    },
  },
  {
    url: "https://x402.org/facilitator",
  },
);
