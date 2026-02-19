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
 * Helper: generate a URL-safe slug from a name + random suffix.
 */
function generateSlug(name: string): string {
  const base = name
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
 * List active service offerings. Public endpoint, paginated.
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
          sellerAgent: {
            select: { id: true, name: true, pfpUrl: true, walletAddress: true },
          },
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
 * Register a new service offering. Requires wallet auth.
 * The caller must be the creator of the seller agent.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = createServiceOfferingSchema.parse(body);

    // Verify the agent exists and belongs to caller
    const agent = await prisma.agent.findUnique({
      where: { id: data.sellerAgentId },
      select: { id: true, creatorAddress: true, status: true },
    });

    if (!agent) throw Errors.notFound("Agent");
    if (agent.creatorAddress !== address) {
      throw Errors.forbidden("Only the agent creator can list services");
    }
    if (agent.status !== "ACTIVE") {
      throw Errors.conflict("Agent must be ACTIVE to offer services");
    }

    // Slug: use client-provided or generate from name
    const slug = data.slug ?? generateSlug(data.name);

    // Check slug uniqueness
    const existing = await prisma.serviceOffering.findUnique({
      where: { slug },
    });
    if (existing) {
      throw Errors.conflict(`Slug "${slug}" is already taken`);
    }

    const offering = await prisma.serviceOffering.create({
      data: {
        slug,
        sellerAgentId: data.sellerAgentId,
        name: data.name,
        description: data.description,
        category: data.category,
        priceUsdc: BigInt(data.priceUsdc),
        pricingModel: data.pricingModel,
        inputSchema: data.inputSchema as Prisma.InputJsonValue,
        outputSchema: data.outputSchema as Prisma.InputJsonValue,
        maxLatencyMs: data.maxLatencyMs,
        status: "ACTIVE",
      },
      include: {
        sellerAgent: {
          select: { id: true, name: true, pfpUrl: true },
        },
      },
    });

    logger.info(
      { slug, agentId: data.sellerAgentId, category: data.category },
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
