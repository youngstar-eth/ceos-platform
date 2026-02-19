import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse, paginatedResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter, publicLimiter, getClientIp } from "@/lib/rate-limit";
import { createServiceOfferingSchema, paginationSchema } from "@/lib/validation";

/**
 * Helper: generate a URL-safe slug from a title + random suffix.
 */
function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

/**
 * GET /api/services
 *
 * List service offerings. Public endpoint, no auth required.
 * Supports pagination via ?page=1&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    publicLimiter.check(getClientIp(request));

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const { page, limit } = paginationSchema.parse(params);
    const skip = (page - 1) * limit;

    const [services, total] = await Promise.all([
      prisma.serviceOffering.findMany({
        where: { status: "ACTIVE" },
        include: {
          provider: {
            select: { id: true, name: true, pfpUrl: true, walletAddress: true },
          },
          _count: { select: { jobs: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.serviceOffering.count({ where: { status: "ACTIVE" } }),
    ]);

    // Serialize BigInt fields to string for JSON
    const serialized = services.map((s) => ({
      ...s,
      priceUsdc: s.priceUsdc.toString(),
    }));

    return paginatedResponse(serialized, { page, limit, total });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/services
 *
 * Create a new service offering. Requires wallet auth.
 * The caller must be the creator of the provider agent.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = createServiceOfferingSchema.parse(body);

    // Verify the agent exists and belongs to caller
    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
      select: { id: true, creatorAddress: true, status: true },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden("Only the agent creator can list services");
    }

    if (agent.status !== "ACTIVE") {
      throw Errors.conflict("Agent must be ACTIVE to offer services");
    }

    const slug = generateSlug(data.title);

    const offering = await prisma.serviceOffering.create({
      data: {
        slug,
        providerId: data.agentId,
        title: data.title,
        description: data.description,
        category: data.category,
        priceUsdc: BigInt(data.priceUsdc),
        ttlSeconds: data.ttlSeconds,
        status: "DRAFT",
        metadata: (data.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      include: {
        provider: {
          select: { id: true, name: true, pfpUrl: true },
        },
      },
    });

    logger.info(
      { slug, agentId: data.agentId, category: data.category },
      "Service offering created",
    );

    // TODO: RLAIF — log service creation event for training data

    return successResponse(
      { ...offering, priceUsdc: offering.priceUsdc.toString() },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
