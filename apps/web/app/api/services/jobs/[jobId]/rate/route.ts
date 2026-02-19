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
 * Rate a completed service job. Only the buyer's creator can rate.
 * Recalculates the offering's avgRating via $transaction.
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
        buyerAgent: { select: { creatorAddress: true } },
      },
    });

    if (!job) throw Errors.notFound("Service job");

    // Only buyer creator can rate
    if (job.buyerAgent.creatorAddress !== address) {
      throw Errors.forbidden("Only the buyer agent's creator can rate");
    }

    // Must be completed
    if (job.status !== "COMPLETED") {
      throw Errors.conflict("Can only rate COMPLETED jobs");
    }

    // Cannot re-rate
    if (job.buyerRating !== null) {
      throw Errors.conflict("Job has already been rated");
    }

    // Atomic: update job rating + recalculate offering avgRating
    const [updatedJob] = await prisma.$transaction(async (tx) => {
      const rated = await tx.serviceJob.update({
        where: { id: jobId },
        data: {
          buyerRating: data.rating,
          buyerFeedback: data.feedback ?? null,
        },
        include: {
          offering: {
            select: { id: true, slug: true, name: true, category: true },
          },
        },
      });

      // Recalculate offering avgRating from all rated jobs
      const ratingAgg = await tx.serviceJob.aggregate({
        where: { offeringId: rated.offeringId, buyerRating: { not: null } },
        _avg: { buyerRating: true },
      });

      await tx.serviceOffering.update({
        where: { id: rated.offeringId },
        data: { avgRating: ratingAgg._avg.buyerRating },
      });

      return [rated];
    });

    logger.info(
      { jobId, rating: data.rating, offeringId: updatedJob.offeringId },
      "Service job rated — avgRating recalculated",
    );

    // TODO: RLAIF — log rating event for training data

    return successResponse({
      ...updatedJob,
      priceUsdc: updatedJob.priceUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
