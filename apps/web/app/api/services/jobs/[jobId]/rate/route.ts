import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { rateServiceJobSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ jobId: string }> };

/**
 * POST /api/services/jobs/[jobId]/rate
 *
 * Rate a completed service job. Only the BUYER's creator can rate.
 * The job must be in COMPLETED status and not yet rated.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { jobId } = await context.params;
    const body: unknown = await request.json();
    const data = rateServiceJobSchema.parse(body);

    const job = await prisma.serviceJob.findUnique({
      where: { id: jobId },
      include: {
        buyer: { select: { creatorAddress: true } },
      },
    });

    if (!job) {
      throw Errors.notFound("ServiceJob");
    }

    // Only the buyer's creator can rate
    if (job.buyer.creatorAddress !== address) {
      throw Errors.forbidden("Only the buyer can rate a service job");
    }

    // Must be completed
    if (job.status !== "COMPLETED") {
      throw Errors.conflict("Can only rate COMPLETED jobs");
    }

    // Cannot re-rate
    if (job.rating !== null) {
      throw Errors.conflict("Job has already been rated");
    }

    const rated = await prisma.serviceJob.update({
      where: { id: jobId },
      data: {
        rating: data.rating,
        ratingComment: data.comment ?? null,
      },
      include: {
        service: {
          select: { slug: true, title: true, providerId: true },
        },
      },
    });

    logger.info(
      {
        jobId,
        rating: data.rating,
        serviceSlug: rated.service.slug,
        providerId: rated.service.providerId,
      },
      "Service job rated",
    );

    // TODO: RLAIF — log rating event for AgentScore computation

    return successResponse({
      ...rated,
      pricePaidUsdc: rated.pricePaidUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
