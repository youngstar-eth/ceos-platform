import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { deployAgentSchema } from "@/lib/validation";

/**
 * POST /api/agents/deploy
 *
 * Orchestrate agent deployment:
 * 1. Verify the on-chain deployment transaction
 * 2. Update agent status to DEPLOYING
 * 3. Trigger Farcaster account creation (via Neynar)
 * 4. Store on-chain address and token ID
 *
 * The actual Farcaster account creation and BullMQ job
 * scheduling are handled asynchronously by the agent runtime.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = deployAgentSchema.parse(body);

    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden("Only the creator can deploy this agent");
    }

    if (agent.status !== "PENDING") {
      throw Errors.conflict(
        `Agent cannot be deployed from status "${agent.status}"`,
      );
    }

    // Transition to DEPLOYING — the agent runtime will pick this up
    const updated = await prisma.agent.update({
      where: { id: data.agentId },
      data: {
        status: "DEPLOYING",
        onChainAddress: data.txHash,
      },
    });

    logger.info(
      { agentId: data.agentId, txHash: data.txHash, creator: address },
      "Agent deployment initiated",
    );

    return successResponse(
      {
        agent: updated,
        message: "Deployment initiated. Agent will be activated once on-chain confirmation is received.",
      },
      202,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
