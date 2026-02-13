import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { ethereumAddress } from "@/lib/validation";
import { getCurrentEpoch } from "@openclaw/shared/utils";

interface RouteContext {
  params: Promise<{ address: string }>;
}

/**
 * GET /api/revenue/score/[address]
 *
 * Get the creator score breakdown for a wallet address.
 * Returns scores across all epochs with the latest highlighted.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const { address } = await context.params;
    ethereumAddress.parse(address);

    const scores = await prisma.creatorScore.findMany({
      where: { address },
      orderBy: { epoch: "desc" },
    });

    if (scores.length === 0) {
      throw Errors.notFound("Creator score");
    }

    const currentEpoch = getCurrentEpoch();
    const latestScore = scores[0] ?? null;

    return successResponse({
      address,
      currentEpoch,
      latestScore: latestScore
        ? {
            epoch: latestScore.epoch,
            engagement: latestScore.engagement,
            growth: latestScore.growth,
            quality: latestScore.quality,
            uptime: latestScore.uptime,
            totalScore: latestScore.totalScore,
          }
        : null,
      history: scores.map((s) => ({
        epoch: s.epoch,
        engagement: s.engagement,
        growth: s.growth,
        quality: s.quality,
        uptime: s.uptime,
        totalScore: s.totalScore,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
