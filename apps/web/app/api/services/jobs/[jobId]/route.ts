import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { updateServiceJobSchema } from "@/lib/validation";
import type { ServiceJobStatus } from "@prisma/client";

type RouteContext = { params: Promise<{ jobId: string }> };

/**
 * Valid state transitions for service jobs.
 * Only the provider can transition most states; the BullMQ worker handles EXPIRED.
 */
const VALID_TRANSITIONS: Record<ServiceJobStatus, ServiceJobStatus[]> = {
  CREATED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["DELIVERING"],
  DELIVERING: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
  DISPUTED: [],
  EXPIRED: [],
};

/**
 * GET /api/services/jobs/[jobId]
 *
 * Fetch a single service job by ID. Requires auth — must be buyer or provider's creator.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { jobId } = await context.params;

    const job = await prisma.serviceJob.findUnique({
      where: { id: jobId },
      include: {
        service: {
          include: {
            provider: {
              select: { id: true, name: true, pfpUrl: true, creatorAddress: true },
            },
          },
        },
        buyer: {
          select: { id: true, name: true, pfpUrl: true, creatorAddress: true },
        },
      },
    });

    if (!job) {
      throw Errors.notFound("ServiceJob");
    }

    // Only buyer's creator or provider's creator can view
    const isBuyerCreator = job.buyer.creatorAddress === address;
    const isProviderCreator = job.service.provider.creatorAddress === address;

    if (!isBuyerCreator && !isProviderCreator) {
      throw Errors.forbidden("Not authorized to view this job");
    }

    // Strip internal fields before returning
    const { buyer: { creatorAddress: _ba, ...buyerPublic }, service: { provider: { creatorAddress: _pa, ...providerPublic }, ...servicePublic }, ...jobFields } = job;

    return successResponse({
      ...jobFields,
      pricePaidUsdc: jobFields.pricePaidUsdc.toString(),
      service: { ...servicePublic, provider: providerPublic },
      buyer: buyerPublic,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PATCH /api/services/jobs/[jobId]
 *
 * Transition a service job's status. Only the PROVIDER's creator can do this.
 * Valid transitions follow the state machine defined in VALID_TRANSITIONS.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { jobId } = await context.params;
    const body: unknown = await request.json();
    const data = updateServiceJobSchema.parse(body);

    // Fetch job with provider info
    const job = await prisma.serviceJob.findUnique({
      where: { id: jobId },
      include: {
        service: {
          include: {
            provider: { select: { creatorAddress: true, id: true } },
          },
        },
      },
    });

    if (!job) {
      throw Errors.notFound("ServiceJob");
    }

    // Only the service provider's creator can transition the job
    if (job.service.provider.creatorAddress !== address) {
      throw Errors.forbidden("Only the service provider can update job status");
    }

    // Validate state transition
    const allowedNext = VALID_TRANSITIONS[job.status] ?? [];
    if (!allowedNext.includes(data.status)) {
      throw Errors.conflict(
        `Cannot transition from ${job.status} to ${data.status}. ` +
        `Allowed: ${allowedNext.join(", ") || "none"}`,
      );
    }

    // Check if job has expired
    if (new Date() > job.expiresAt && data.status !== "REJECTED") {
      throw Errors.conflict("Job has expired — cannot transition");
    }

    const updated = await prisma.serviceJob.update({
      where: { id: jobId },
      data: {
        status: data.status,
        ...(data.outputPayload !== undefined && { outputPayload: data.outputPayload as Prisma.InputJsonValue }),
        ...(data.failedReason !== undefined && { failedReason: data.failedReason }),
        ...(data.status === "COMPLETED" && { completedAt: new Date() }),
      },
      include: {
        service: {
          select: { slug: true, title: true, providerId: true },
        },
        buyer: {
          select: { id: true, name: true },
        },
      },
    });

    logger.info(
      {
        jobId,
        from: job.status,
        to: data.status,
        providerId: job.service.provider.id,
      },
      "Service job status transitioned",
    );

    // TODO: RLAIF — log state transition for training data
    // TODO (Phase 5): On COMPLETED, trigger $RUN buyback & burn (2% of pricePaidUsdc)

    return successResponse({
      ...updated,
      pricePaidUsdc: updated.pricePaidUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
