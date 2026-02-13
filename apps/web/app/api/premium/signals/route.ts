import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { requirePayment } from "@/app/api/premium/middleware";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** $0.10 in USDC 6-decimal micro-units */
const PRICE_USDC = "100000";
const DESCRIPTION = "Top trading signals for the current epoch ($0.10 USDC)";
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
  epoch: number;
  generatedAt: string;
  signals: TradingSignal[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a confidence percentage (0–100) from win rate and Sharpe ratio.
 * Win rate contributes 60%, capped Sharpe ratio contributes 40%.
 */
function calculateConfidence(winRate: number, sharpeRatio: number): number {
  const winComponent = Math.min(winRate, 100) * 0.6;
  const sharpeComponent = Math.min(Math.max(sharpeRatio, 0), 3) / 3 * 100 * 0.4;
  return Math.round(winComponent + sharpeComponent);
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/premium/signals
 *
 * x402-gated ($0.10 USDC). Returns the top 5 trading signals from agents
 * in the current epoch, ranked by absolute PNL. Each signal includes a
 * directional call (bullish/bearish) based on PNL sign and a confidence
 * score derived from win rate and Sharpe ratio.
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
      return successResponse<SignalsResponse>({
        epoch,
        generatedAt: new Date().toISOString(),
        signals: [],
      });
    }

    const agentIds = topTradingScores.map((s) => s.agentId);

    // Fetch corresponding trading metrics
    const tradingMetrics = await prisma.tradingMetric.findMany({
      where: { epoch, agentId: { in: agentIds } },
    });

    const tradingMap = new Map(
      tradingMetrics.map((t) => [t.agentId, t]),
    );

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

    const response: SignalsResponse = {
      epoch,
      generatedAt: new Date().toISOString(),
      signals,
    };

    logger.info(
      { epoch, signalCount: signals.length },
      "Premium trading signals served",
    );

    return successResponse(response);
  } catch (err) {
    return errorResponse(err);
  }
}
