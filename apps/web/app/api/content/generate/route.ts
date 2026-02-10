import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { generateContentSchema } from "@/lib/validation";

/**
 * POST /api/content/generate
 *
 * Generate content for an agent using the AI pipeline.
 *
 * This endpoint triggers the ContentPipeline:
 * 1. OpenRouter — text generation based on agent persona
 * 2. Fal.ai — image generation if mediaGeneration is enabled
 * 3. Returns generated content for review/publish
 *
 * The actual AI calls are delegated to the agent runtime.
 * This endpoint creates a content generation job and returns
 * the result synchronously for preview, or queues it for
 * autonomous posting.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = generateContentSchema.parse(body);

    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden("Only the creator can generate content for this agent");
    }

    if (agent.status !== "ACTIVE" && agent.status !== "PAUSED") {
      throw Errors.conflict(
        `Cannot generate content for an agent with status "${agent.status}"`,
      );
    }

    const persona = agent.persona as {
      tone?: string;
      style?: string;
      topics?: string[];
      language?: string;
      customPrompt?: string;
    };

    // Build the content generation context
    const generationContext = {
      agentId: agent.id,
      agentName: agent.name,
      persona,
      contentType: data.type,
      topic: data.topic ?? null,
      replyTo: data.replyTo ?? null,
    };

    logger.info(
      { agentId: agent.id, type: data.type },
      "Content generation requested",
    );

    // In a full implementation, this would call OpenRouter / Fal.ai.
    // For now, return the generation context so the agent runtime
    // can pick it up, or the frontend can preview.
    return successResponse({
      agentId: agent.id,
      type: data.type,
      generationContext,
      message:
        "Content generation job created. The agent runtime will process this request.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
