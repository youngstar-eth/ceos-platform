import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse, paginatedResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { createServiceJobSchema, paginationSchema } from "@/lib/validation";

/**
 * POST /api/services/jobs
 *
 * Create a new service job (purchase a service).
 * The buyer agent's creator must sign the request.
 * The x402 payment must be completed before or alongside this call.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = createServiceJobSchema.parse(body);

    // Verify buyer agent exists and belongs to caller
    const buyerAgent = await prisma.agent.findUnique({
      where: { id: data.buyerAgentId },
      select: { id: true, creatorAddress: true, status: true },
    });

    if (!buyerAgent) {
      throw Errors.notFound("Buyer Agent");
    }

    if (buyerAgent.creatorAddress !== address) {
      throw Errors.forbidden("Only the buyer agent's creator can purchase services");
    }

    if (buyerAgent.status !== "ACTIVE") {
      throw Errors.conflict("Buyer agent must be ACTIVE to purchase services");
    }

    // Verify the service offering exists and is ACTIVE
    const service = await prisma.serviceOffering.findUnique({
      where: { id: data.serviceId },
      select: { id: true, providerId: true, priceUsdc: true, ttlSeconds: true, status: true },
    });

    if (!service) {
      throw Errors.notFound("ServiceOffering");
    }

    if (service.status !== "ACTIVE") {
      throw Errors.conflict("Service offering is not ACTIVE");
    }

    // Prevent buying your own service
    if (service.providerId === data.buyerAgentId) {
      throw Errors.conflict("An agent cannot purchase its own service");
    }

    // Calculate expiry based on service TTL
    const expiresAt = new Date(Date.now() + service.ttlSeconds * 1000);

    // TODO: x402 payment verification — verify payment header or on-chain tx
    // For now, we trust the caller and record the job. In Phase 3, this will
    // integrate with the x402 payment rail to verify micro-payment before creating the job.

    // 2% Buyback & Burn — deducted from service price
    // TODO (Phase 5): Implement actual $RUN buyback on-chain
    // const buybackAmount = service.priceUsdc * 2n / 100n;

    const job = await prisma.serviceJob.create({
      data: {
        serviceId: service.id,
        buyerId: data.buyerAgentId,
        status: "CREATED",
        inputPayload: (data.inputPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        pricePaidUsdc: service.priceUsdc,
        expiresAt,
      },
      include: {
        service: {
          select: { slug: true, title: true, category: true },
        },
        buyer: {
          select: { id: true, name: true },
        },
      },
    });

    logger.info(
      {
        jobId: job.id,
        serviceSlug: job.service.slug,
        buyerId: data.buyerAgentId,
        providerId: service.providerId,
        priceUsdc: service.priceUsdc.toString(),
      },
      "Service job created",
    );

    // TODO: RLAIF — log service purchase decision for training data

    return successResponse(
      {
        ...job,
        pricePaidUsdc: job.pricePaidUsdc.toString(),
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * GET /api/services/jobs
 *
 * List service jobs. Requires wallet auth.
 * Returns jobs where the caller is the buyer or provider agent's creator.
 *
 * Query params:
 *   - agentId: filter by a specific agent (as buyer or provider)
 *   - status: filter by job status
 *   - role: "buyer" | "provider" — filter perspective
 *   - page / limit: pagination
 */
export async function GET(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const { page, limit } = paginationSchema.parse(params);
    const skip = (page - 1) * limit;

    const agentId = params.agentId;
    const statusFilter = params.status;
    const roleFilter = params.role; // "buyer" | "provider"

    // Find all agents belonging to this wallet address
    const userAgents = await prisma.agent.findMany({
      where: { creatorAddress: address },
      select: { id: true },
    });

    const userAgentIds = userAgents.map((a) => a.id);

    if (userAgentIds.length === 0) {
      return paginatedResponse([], { page, limit, total: 0 });
    }

    // Build filter: only show jobs involving the caller's agents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (agentId) {
      // Must be one of caller's agents
      if (!userAgentIds.includes(agentId)) {
        throw Errors.forbidden("Agent does not belong to caller");
      }

      if (roleFilter === "buyer") {
        where.buyerId = agentId;
      } else if (roleFilter === "provider") {
        where.service = { providerId: agentId };
      } else {
        where.OR = [
          { buyerId: agentId },
          { service: { providerId: agentId } },
        ];
      }
    } else {
      // All jobs involving any of caller's agents
      where.OR = [
        { buyerId: { in: userAgentIds } },
        { service: { providerId: { in: userAgentIds } } },
      ];
    }

    if (statusFilter) {
      where.status = statusFilter;
    }

    const [jobs, total] = await Promise.all([
      prisma.serviceJob.findMany({
        where,
        include: {
          service: {
            select: { slug: true, title: true, category: true, providerId: true },
          },
          buyer: {
            select: { id: true, name: true, pfpUrl: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.serviceJob.count({ where }),
    ]);

    const serialized = jobs.map((j) => ({
      ...j,
      pricePaidUsdc: j.pricePaidUsdc.toString(),
    }));

    return paginatedResponse(serialized, { page, limit, total });
  } catch (err) {
    return errorResponse(err);
  }
}
