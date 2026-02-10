import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { claimRevenueSchema } from "@/lib/validation";

/**
 * POST /api/revenue/claim
 *
 * Build a revenue claim transaction for the authenticated wallet.
 *
 * Steps:
 * 1. Verify the epoch is finalized
 * 2. Verify no existing claim for this address + epoch
 * 3. Look up the creator score to calculate share
 * 4. Return the transaction data for the client to sign
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const { epoch } = claimRevenueSchema.parse(body);

    // Check epoch exists and is finalized
    const revenueEpoch = await prisma.revenueEpoch.findUnique({
      where: { epochNumber: epoch },
    });

    if (!revenueEpoch) {
      throw Errors.notFound("Revenue epoch");
    }

    if (!revenueEpoch.finalized) {
      throw Errors.conflict("Epoch has not been finalized yet");
    }

    // Check for duplicate claim
    const existingClaim = await prisma.revenueClaim.findUnique({
      where: { address_epoch: { address, epoch } },
    });

    if (existingClaim) {
      throw Errors.conflict("Revenue already claimed for this epoch");
    }

    // Look up creator score
    const score = await prisma.creatorScore.findUnique({
      where: { address_epoch: { address, epoch } },
    });

    if (!score) {
      throw Errors.notFound("Creator score for this epoch");
    }

    // Calculate the claimable amount as a proportion of the creator share
    const totalScoresResult = await prisma.creatorScore.aggregate({
      where: { epoch },
      _sum: { totalScore: true },
    });

    const totalScores = totalScoresResult._sum.totalScore ?? 0;
    if (totalScores === 0) {
      throw Errors.conflict("No scores recorded for this epoch");
    }

    const claimableAmount =
      (revenueEpoch.creatorShare * BigInt(score.totalScore)) /
      BigInt(totalScores);

    logger.info(
      { address, epoch, amount: claimableAmount.toString() },
      "Revenue claim prepared",
    );

    return successResponse({
      address,
      epoch,
      amount: claimableAmount.toString(),
      score: {
        engagement: score.engagement,
        growth: score.growth,
        quality: score.quality,
        uptime: score.uptime,
        totalScore: score.totalScore,
      },
      message:
        "Sign and submit the claim transaction using the RevenuePool contract.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
