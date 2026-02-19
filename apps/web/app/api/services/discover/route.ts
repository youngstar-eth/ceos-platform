import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { serviceDiscoveryQuerySchema } from "@/lib/validation";

/**
 * GET /api/services/discover
 *
 * Discovery endpoint with filtering, search, sorting, and pagination.
 *
 * Query params:
 *   category    — filter by category
 *   maxPrice    — max micro-USDC price
 *   capability  — case-insensitive search on name + description
 *   sort        — rating | price_asc | price_desc | newest | jobs_completed
 *   page, limit — pagination (max 50)
 */
export async function GET(request: NextRequest) {
  try {
    publicLimiter.check(getClientIp(request));

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = serviceDiscoveryQuerySchema.parse(params);

    const where: Prisma.ServiceOfferingWhereInput = { status: "ACTIVE" };

    if (query.category) {
      where.category = query.category;
    }

    if (query.maxPrice !== undefined) {
      where.priceUsdc = { lte: BigInt(query.maxPrice) };
    }

    if (query.capability) {
      where.OR = [
        { name: { contains: query.capability, mode: "insensitive" } },
        { description: { contains: query.capability, mode: "insensitive" } },
      ];
    }

    // Sort mapping
    let orderBy: Prisma.ServiceOfferingOrderByWithRelationInput;
    switch (query.sort) {
      case "price_asc":
        orderBy = { priceUsdc: "asc" };
        break;
      case "price_desc":
        orderBy = { priceUsdc: "desc" };
        break;
      case "jobs_completed":
        orderBy = { completedJobs: "desc" };
        break;
      case "rating":
        orderBy = { avgRating: { sort: "desc", nulls: "last" } };
        break;
      case "newest":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    const skip = (query.page - 1) * query.limit;

    const [offerings, total] = await Promise.all([
      prisma.serviceOffering.findMany({
        where,
        include: {
          sellerAgent: {
            select: { id: true, name: true, walletAddress: true },
          },
        },
        orderBy,
        skip,
        take: query.limit,
      }),
      prisma.serviceOffering.count({ where }),
    ]);

    const serialized = offerings.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      category: o.category,
      priceUsdc: o.priceUsdc.toString(),
      pricingModel: o.pricingModel,
      avgRating: o.avgRating,
      completedJobs: o.completedJobs,
      totalJobs: o.totalJobs,
      maxLatencyMs: o.maxLatencyMs,
      avgLatencyMs: o.avgLatencyMs,
      sellerAgent: o.sellerAgent,
    }));

    return successResponse({
      offerings: serialized,
      total,
      page: query.page,
      limit: query.limit,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
