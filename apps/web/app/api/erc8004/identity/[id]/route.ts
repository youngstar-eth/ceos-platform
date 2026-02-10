import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/erc8004/identity/[id]
 *
 * Retrieve the ERC-8004 on-chain identity for an agent.
 * The `id` parameter is the agent ID (not the token ID).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const { id } = await context.params;

    const identity = await prisma.eRC8004Identity.findUnique({
      where: { agentId: id },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            fid: true,
            status: true,
            creatorAddress: true,
          },
        },
      },
    });

    if (!identity) {
      throw Errors.notFound("ERC-8004 identity");
    }

    return successResponse({
      agentId: identity.agentId,
      tokenId: identity.tokenId,
      agentUri: identity.agentUri,
      reputationScore: identity.reputationScore,
      registrationJson: identity.registrationJson,
      createdAt: identity.createdAt.toISOString(),
      updatedAt: identity.updatedAt.toISOString(),
      agent: identity.agent,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
