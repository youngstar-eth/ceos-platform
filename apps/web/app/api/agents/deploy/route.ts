export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { deployAgentSchema } from "@/lib/validation";
import { generateAgentProfileImages } from "@/lib/profile-image-generator";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();

    if (DEMO_MODE) {
      return await handleDemoDeployment(body, address);
    }

    return await handleProductionDeployment(body, address);
  } catch (err) {
    return errorResponse(err);
  }
}

// --- DEMO MODE (delegates to production flow) ---
async function handleDemoDeployment(body: unknown, address: string) {
  return handleProductionDeployment(body, address);
}

// --- PRODUCTION MODE (ASYNC SOVEREIGN WALLET DEPLOYMENT) ---
async function handleProductionDeployment(body: unknown, address: string) {
  const data = deployAgentSchema.parse(body);

  const agent = await prisma.agent.findUnique({
    where: { id: data.agentId },
  });

  if (!agent) throw Errors.notFound("Agent");
  if (agent.creatorAddress !== address) throw Errors.forbidden("Only creator can deploy");

  // Guard: only PENDING agents can be deployed
  if (agent.status !== "PENDING") {
    throw Errors.badRequest(
      `Agent is already ${agent.status}. Only PENDING agents can be deployed.`,
    );
  }

  // 1. Profile Image Generation (non-blocking on failure)
  let generatedPfpUrl: string | null = null;
  let generatedBannerUrl: string | null = null;
  try {
    const personaObj =
      typeof agent.persona === "object" && agent.persona !== null
        ? (agent.persona as Record<string, unknown>)
        : {};

    const profileImages = await generateAgentProfileImages({
      name: agent.name,
      description: agent.description,
      persona: personaObj,
      skills: agent.skills,
    });

    generatedPfpUrl = profileImages.pfpUrl;
    generatedBannerUrl = profileImages.bannerUrl;

    logger.info(
      { hasPfp: !!generatedPfpUrl, hasBanner: !!generatedBannerUrl },
      "Profile images generated",
    );
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "Profile image generation failed, continuing without images",
    );
  }

  // 2. Transition to DEPLOYING — wallet provisioning happens asynchronously
  //    via the WalletProvisioner worker in agent-runtime.
  //    The worker picks up DEPLOYING agents and calls walletStore.provisionWallet().
  const updated = await prisma.agent.update({
    where: { id: data.agentId },
    data: {
      status: "DEPLOYING",
      walletEmail: `sovereign-${data.agentId}@ceos.run`,
      ...(generatedPfpUrl && { pfpUrl: generatedPfpUrl }),
      ...(generatedBannerUrl && { bannerUrl: generatedBannerUrl }),
    },
  });

  logger.info(
    { agentId: data.agentId, status: "DEPLOYING" },
    "Agent deployment initiated — wallet provisioning queued for background processing",
  );

  return successResponse({
    agent: updated,
    message:
      "Agent deployment initiated. Wallet provisioning is in progress. " +
      "The agent will become ACTIVE once its Sovereign MPC Wallet is secured.",
  }, 201);
}
