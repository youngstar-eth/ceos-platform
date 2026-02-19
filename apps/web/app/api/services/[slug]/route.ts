import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter, publicLimiter, getClientIp } from "@/lib/rate-limit";
import { updateServiceOfferingSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/services/[slug]
 *
 * Fetch a single service offering by slug. Public endpoint.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    publicLimiter.check(getClientIp(request));

    const { slug } = await context.params;

    const offering = await prisma.serviceOffering.findUnique({
      where: { slug },
      include: {
        provider: {
          select: { id: true, name: true, pfpUrl: true, walletAddress: true },
        },
        _count: { select: { jobs: true } },
      },
    });

    if (!offering) {
      throw Errors.notFound("ServiceOffering");
    }

    return successResponse({
      ...offering,
      priceUsdc: offering.priceUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PATCH /api/services/[slug]
 *
 * Update a service offering. Only the provider agent's creator can do this.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { slug } = await context.params;
    const body: unknown = await request.json();
    const data = updateServiceOfferingSchema.parse(body);

    // Find the offering and verify ownership
    const existing = await prisma.serviceOffering.findUnique({
      where: { slug },
      include: { provider: { select: { creatorAddress: true } } },
    });

    if (!existing) {
      throw Errors.notFound("ServiceOffering");
    }

    if (existing.provider.creatorAddress !== address) {
      throw Errors.forbidden("Only the agent creator can update this service");
    }

    // Cannot update a RETIRED service
    if (existing.status === "RETIRED") {
      throw Errors.conflict("Cannot update a RETIRED service offering");
    }

    const updated = await prisma.serviceOffering.update({
      where: { slug },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.priceUsdc !== undefined && { priceUsdc: BigInt(data.priceUsdc) }),
        ...(data.ttlSeconds !== undefined && { ttlSeconds: data.ttlSeconds }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.metadata !== undefined && { metadata: data.metadata as Prisma.InputJsonValue }),
      },
      include: {
        provider: {
          select: { id: true, name: true, pfpUrl: true },
        },
      },
    });

    logger.info({ slug, updatedFields: Object.keys(data) }, "Service offering updated");

    return successResponse({
      ...updated,
      priceUsdc: updated.priceUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/services/[slug]
 *
 * Soft-delete (retire) a service offering.
 * Sets status to RETIRED — does not physically delete.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { slug } = await context.params;

    const existing = await prisma.serviceOffering.findUnique({
      where: { slug },
      include: { provider: { select: { creatorAddress: true } } },
    });

    if (!existing) {
      throw Errors.notFound("ServiceOffering");
    }

    if (existing.provider.creatorAddress !== address) {
      throw Errors.forbidden("Only the agent creator can retire this service");
    }

    if (existing.status === "RETIRED") {
      throw Errors.conflict("Service offering is already RETIRED");
    }

    const retired = await prisma.serviceOffering.update({
      where: { slug },
      data: { status: "RETIRED" },
    });

    logger.info({ slug }, "Service offering retired");

    return successResponse({
      ...retired,
      priceUsdc: retired.priceUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
