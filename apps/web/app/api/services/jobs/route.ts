import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { createServiceJobSchema } from "@/lib/validation";
import { parseX402Header, verifyServicePayment } from "@/lib/x402-service";

/**
 * POST /api/services/jobs
 *
 * Create a service job (buyer purchases a service).
 *
 * Flow:
 *   1. Resolve offering by slug, verify ACTIVE
 *   2. Verify buyer agent belongs to caller
 *   3. Prevent self-purchase
 *   4. Calculate expiresAt from ttlMinutes
 *   5. Create job + increment offering.totalJobs atomically
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = createServiceJobSchema.parse(body);

    // 1. Resolve offering by slug
    const offering = await prisma.serviceOffering.findFirst({
      where: { slug: data.offeringSlug, status: "ACTIVE" },
      select: { id: true, sellerAgentId: true, priceUsdc: true, slug: true },
    });

    if (!offering) {
      throw Errors.notFound("Service offering (or not ACTIVE)");
    }

    // 2. Verify buyer agent ownership
    const buyerAgent = await prisma.agent.findUnique({
      where: { id: data.buyerAgentId },
      select: { id: true, creatorAddress: true, status: true },
    });

    if (!buyerAgent) throw Errors.notFound("Buyer agent");
    if (buyerAgent.creatorAddress !== address) {
      throw Errors.forbidden("Only the agent creator can purchase services");
    }
    if (buyerAgent.status !== "ACTIVE") {
      throw Errors.conflict("Buyer agent must be ACTIVE");
    }

    // 3. Prevent self-purchase
    if (data.buyerAgentId === offering.sellerAgentId) {
      throw Errors.conflict("An agent cannot purchase its own service");
    }

    // 4. Calculate expiry
    const expiresAt = new Date(Date.now() + data.ttlMinutes * 60 * 1000);

    // ── x402 Payment Verification (Pay-Before-Create) ─────────────────
    //
    // Parse the X-PAYMENT header containing the signed EIP-3009 USDC
    // transfer. If present, verify via the CDP facilitator before
    // creating the job. The USDC is transferred on-chain first.
    //
    let paymentTxHash: string | null = null;

    const paymentData = parseX402Header(request);
    if (paymentData) {
      const verified = await verifyServicePayment(
        paymentData,
        offering.priceUsdc,
        "/api/services/jobs",
      );
      paymentTxHash = verified.txHash;

      logger.info(
        {
          paymentTxHash,
          payer: verified.payer,
          amount: verified.amount.toString(),
          offeringSlug: offering.slug,
        },
        "x402 service payment verified — creating job",
      );
    } else {
      // No X-PAYMENT header — log warning but allow job creation.
      // In production, this gate should be strict (throw if missing).
      // Kept permissive during development/testnet phase.
      logger.warn(
        { offeringSlug: offering.slug, buyerAgentId: data.buyerAgentId },
        "No X-PAYMENT header — job created without on-chain payment verification",
      );
    }

    // 5. Create job + increment totalJobs atomically
    const [job] = await prisma.$transaction([
      prisma.serviceJob.create({
        data: {
          offeringId: offering.id,
          buyerAgentId: data.buyerAgentId,
          sellerAgentId: offering.sellerAgentId,
          requirements: data.requirements as Prisma.InputJsonValue,
          priceUsdc: offering.priceUsdc,
          paymentTxHash,
          expiresAt,
        },
        include: {
          offering: {
            select: { slug: true, name: true, category: true },
          },
          buyerAgent: {
            select: { id: true, name: true, pfpUrl: true },
          },
        },
      }),
      prisma.serviceOffering.update({
        where: { id: offering.id },
        data: { totalJobs: { increment: 1 } },
      }),
    ]);

    logger.info(
      {
        jobId: job.id,
        offeringSlug: offering.slug,
        buyerAgentId: data.buyerAgentId,
        priceUsdc: offering.priceUsdc.toString(),
        paymentTxHash,
      },
      "Service job created",
    );

    // TODO: RLAIF — log service purchase decision for training data

    return successResponse(
      { ...job, priceUsdc: job.priceUsdc.toString() },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * GET /api/services/jobs
 *
 * List service jobs for the caller's agents.
 *
 * Query params:
 *   agentId — filter by specific agent
 *   status  — filter by job status
 *   role    — "buyer" | "seller" (filter perspective)
 *   page, limit — pagination
 */
export async function GET(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    // Find all agents belonging to caller
    const userAgents = await prisma.agent.findMany({
      where: { creatorAddress: address },
      select: { id: true },
    });
    const userAgentIds = userAgents.map((a) => a.id);

    if (userAgentIds.length === 0) {
      return successResponse({ jobs: [], total: 0, page, limit });
    }

    // Build where clause
    const where: Prisma.ServiceJobWhereInput = {};

    const role = params.role as string | undefined;
    const agentId = params.agentId as string | undefined;
    const status = params.status as string | undefined;

    if (agentId) {
      // Verify requested agent belongs to caller
      if (!userAgentIds.includes(agentId)) {
        throw Errors.forbidden("Agent does not belong to you");
      }
      if (role === "seller") {
        where.sellerAgentId = agentId;
      } else if (role === "buyer") {
        where.buyerAgentId = agentId;
      } else {
        where.OR = [
          { buyerAgentId: agentId },
          { sellerAgentId: agentId },
        ];
      }
    } else {
      // All jobs involving caller's agents
      if (role === "seller") {
        where.sellerAgentId = { in: userAgentIds };
      } else if (role === "buyer") {
        where.buyerAgentId = { in: userAgentIds };
      } else {
        where.OR = [
          { buyerAgentId: { in: userAgentIds } },
          { sellerAgentId: { in: userAgentIds } },
        ];
      }
    }

    if (status) {
      where.status = status as Prisma.EnumServiceJobStatusFilter;
    }

    const [jobs, total] = await Promise.all([
      prisma.serviceJob.findMany({
        where,
        include: {
          offering: {
            select: { slug: true, name: true, category: true },
          },
          buyerAgent: {
            select: { id: true, name: true, pfpUrl: true },
          },
          sellerAgent: {
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
      priceUsdc: j.priceUsdc.toString(),
    }));

    return successResponse({ jobs: serialized, total, page, limit });
  } catch (err) {
    return errorResponse(err);
  }
}
