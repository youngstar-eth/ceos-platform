export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { getCurrentEpoch } from "@ceosrun/shared/utils";

/**
 * GET /api/revenue
 *
 * Revenue overview: current epoch, total revenue, recent epochs.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const currentEpoch = getCurrentEpoch();

    const [epochs, totalRevenue, totalClaimed] = await Promise.all([
      prisma.revenueEpoch.findMany({
        orderBy: { epochNumber: "desc" },
        take: 10,
        include: {
          claims: {
            select: { address: true, amount: true },
          },
        },
      }),
      prisma.revenueEpoch.aggregate({
        _sum: { totalRevenue: true },
      }),
      prisma.revenueClaim.aggregate({
        _sum: { amount: true },
      }),
    ]);

    return successResponse({
      currentEpoch,
      totalRevenue: (totalRevenue._sum.totalRevenue ?? BigInt(0)).toString(),
      totalClaimed: (totalClaimed._sum.amount ?? BigInt(0)).toString(),
      recentEpochs: epochs.map((e) => ({
        epochNumber: e.epochNumber,
        totalRevenue: e.totalRevenue.toString(),
        creatorShare: e.creatorShare.toString(),
        finalized: e.finalized,
        finalizedAt: e.finalizedAt?.toISOString() ?? null,
        claimCount: e.claims.length,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}