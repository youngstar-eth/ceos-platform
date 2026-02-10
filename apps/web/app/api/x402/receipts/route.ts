import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { paginatedResponse, errorResponse } from "@/lib/api-utils";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { receiptsQuerySchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/x402/receipts
 *
 * Query x402 payment receipts with optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = receiptsQuerySchema.parse(params);

    const where: Prisma.X402PaymentWhereInput = {};
    if (query.payer) where.payer = query.payer;
    if (query.endpoint) where.endpoint = { contains: query.endpoint };

    const [receipts, total] = await Promise.all([
      prisma.x402Payment.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.x402Payment.count({ where }),
    ]);

    const serialized = receipts.map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      amount: r.amount.toString(),
      payer: r.payer,
      txHash: r.txHash,
      resourceId: r.resourceId,
      createdAt: r.createdAt.toISOString(),
    }));

    return paginatedResponse(serialized, {
      page: query.page,
      limit: query.limit,
      total,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
