import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { publicLimiter, authenticatedLimiter, getClientIp } from "@/lib/rate-limit";
import { updateReputationSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/erc8004/reputation/[id]
 *
 * Get the current reputation score and history for an agent.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const { id } = await context.params;

    const identity = await prisma.eRC8004Identity.findUnique({
      where: { agentId: id },
    });

    if (!identity) {
      throw Errors.notFound("ERC-8004 identity");
    }

    // Retrieve related metrics for reputation history
    const metrics = await prisma.agentMetrics.findMany({
      where: { agentId: id },
      orderBy: { epoch: "desc" },
      take: 10,
    });

    return successResponse({
      agentId: id,
      tokenId: identity.tokenId,
      reputationScore: identity.reputationScore,
      history: metrics.map((m) => ({
        epoch: m.epoch,
        engagementRate: m.engagementRate,
        followerGrowth: m.followerGrowth,
        contentQuality: m.contentQuality,
        uptime: m.uptime,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/erc8004/reputation/[id]
 *
 * Update the reputation score for an agent.
 * This is called by the MetricsWorker at epoch boundaries.
 * Requires wallet authentication (deployer or contract owner).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { id } = await context.params;

    const body: unknown = await request.json();
    const data = updateReputationSchema.parse(body);

    const identity = await prisma.eRC8004Identity.findUnique({
      where: { agentId: id },
    });

    if (!identity) {
      throw Errors.notFound("ERC-8004 identity");
    }

    const updated = await prisma.eRC8004Identity.update({
      where: { agentId: id },
      data: {
        reputationScore: data.reputationScore,
      },
    });

    logger.info(
      { agentId: id, score: data.reputationScore, epoch: data.epoch, updatedBy: address },
      "Reputation score updated",
    );

    return successResponse({
      agentId: id,
      tokenId: updated.tokenId,
      reputationScore: updated.reputationScore,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
