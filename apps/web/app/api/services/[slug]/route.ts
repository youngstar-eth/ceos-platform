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
        sellerAgent: {
          select: { id: true, name: true, pfpUrl: true, walletAddress: true },
        },
      },
    });

    if (!offering) throw Errors.notFound("Service offering");

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
 * Update a service offering. Only the seller agent's creator can update.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);
    const { slug } = await context.params;

    const existing = await prisma.serviceOffering.findUnique({
      where: { slug },
      include: {
        sellerAgent: { select: { creatorAddress: true } },
      },
    });

    if (!existing) throw Errors.notFound("Service offering");
    if (existing.sellerAgent.creatorAddress !== address) {
      throw Errors.forbidden("Only the seller agent's creator can update");
    }
    if (existing.status === "DELISTED") {
      throw Errors.conflict("Cannot update a DELISTED service");
    }

    const body: unknown = await request.json();
    const data = updateServiceOfferingSchema.parse(body);

    const updated = await prisma.serviceOffering.update({
      where: { slug },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.priceUsdc !== undefined && {
          priceUsdc: BigInt(data.priceUsdc),
        }),
        ...(data.pricingModel !== undefined && {
          pricingModel: data.pricingModel,
        }),
        ...(data.inputSchema !== undefined && {
          inputSchema: data.inputSchema as Prisma.InputJsonValue,
        }),
        ...(data.outputSchema !== undefined && {
          outputSchema: data.outputSchema as Prisma.InputJsonValue,
        }),
        ...(data.maxLatencyMs !== undefined && {
          maxLatencyMs: data.maxLatencyMs,
        }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: {
        sellerAgent: {
          select: { id: true, name: true, pfpUrl: true },
        },
      },
    });

    logger.info({ slug }, "Service offering updated");

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
 * Soft-delete a service offering (set status to DELISTED).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);
    const { slug } = await context.params;

    const existing = await prisma.serviceOffering.findUnique({
      where: { slug },
      include: {
        sellerAgent: { select: { creatorAddress: true } },
      },
    });

    if (!existing) throw Errors.notFound("Service offering");
    if (existing.sellerAgent.creatorAddress !== address) {
      throw Errors.forbidden("Only the seller agent's creator can delist");
    }
    if (existing.status === "DELISTED") {
      throw Errors.conflict("Service is already DELISTED");
    }

    const delisted = await prisma.serviceOffering.update({
      where: { slug },
      data: { status: "DELISTED" },
      include: {
        sellerAgent: {
          select: { id: true, name: true, pfpUrl: true },
        },
      },
    });

    logger.info({ slug }, "Service offering delisted");

    return successResponse({
      ...delisted,
      priceUsdc: delisted.priceUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
