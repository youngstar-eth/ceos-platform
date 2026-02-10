import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { webhookLimiter, getClientIp } from "@/lib/rate-limit";
import { neynarWebhookSchema } from "@/lib/validation";
import { env } from "@/lib/env";

/**
 * Verify Neynar webhook HMAC-SHA512 signature.
 */
async function verifyNeynarSignature(
  body: string,
  signature: string,
): Promise<boolean> {
  const secret = env.NEYNAR_WEBHOOK_SECRET;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );

  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHex === signature;
}

/**
 * POST /api/webhooks/neynar
 *
 * Handle incoming Neynar webhook events.
 * Events: cast.created, reaction.created, user.updated
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    webhookLimiter.check(ip);

    const rawBody = await request.text();
    const signature = request.headers.get("x-neynar-signature");

    if (!signature) {
      throw Errors.unauthorized("Missing webhook signature");
    }

    const valid = await verifyNeynarSignature(rawBody, signature);
    if (!valid) {
      throw Errors.unauthorized("Invalid webhook signature");
    }

    const payload = neynarWebhookSchema.parse(JSON.parse(rawBody));

    logger.info({ type: payload.type }, "Neynar webhook received");

    switch (payload.type) {
      case "cast.created":
        await handleCastCreated(payload.data);
        break;
      case "reaction.created":
        await handleReactionCreated(payload.data);
        break;
      case "user.updated":
        await handleUserUpdated(payload.data);
        break;
      default:
        logger.warn({ type: payload.type }, "Unknown webhook event type");
    }

    return successResponse({ received: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Handle a new cast published by one of our agents.
 */
async function handleCastCreated(data: Record<string, unknown>): Promise<void> {
  const castHash = data.hash as string | undefined;
  const authorFid = data.author_fid as number | undefined;
  const text = data.text as string | undefined;

  if (!castHash || !authorFid) {
    logger.warn({ data }, "cast.created missing required fields");
    return;
  }

  const agent = await prisma.agent.findUnique({
    where: { fid: authorFid },
  });

  if (!agent) {
    logger.debug({ fid: authorFid }, "cast.created for non-managed agent");
    return;
  }

  await prisma.cast.upsert({
    where: { hash: castHash },
    update: { publishedAt: new Date() },
    create: {
      agentId: agent.id,
      content: text ?? "",
      hash: castHash,
      type: "ORIGINAL",
      publishedAt: new Date(),
    },
  });

  logger.info({ agentId: agent.id, hash: castHash }, "Cast recorded from webhook");
}

/**
 * Handle reaction (like/recast) on a cast from one of our agents.
 */
async function handleReactionCreated(data: Record<string, unknown>): Promise<void> {
  const reactionType = data.reaction_type as string | undefined;
  const targetHash = data.target_hash as string | undefined;

  if (!reactionType || !targetHash) {
    logger.warn({ data }, "reaction.created missing required fields");
    return;
  }

  const cast = await prisma.cast.findUnique({
    where: { hash: targetHash },
  });

  if (!cast) return;

  if (reactionType === "like") {
    await prisma.cast.update({
      where: { id: cast.id },
      data: { likes: { increment: 1 } },
    });
  } else if (reactionType === "recast") {
    await prisma.cast.update({
      where: { id: cast.id },
      data: { recasts: { increment: 1 } },
    });
  }

  logger.info({ hash: targetHash, reactionType }, "Reaction recorded");
}

/**
 * Handle user profile update for a managed agent.
 */
async function handleUserUpdated(data: Record<string, unknown>): Promise<void> {
  const fid = data.fid as number | undefined;
  if (!fid) return;

  const agent = await prisma.agent.findUnique({
    where: { fid },
  });

  if (!agent) return;

  logger.info({ agentId: agent.id, fid }, "Agent user profile updated on Farcaster");
}
