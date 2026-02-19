import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, paginatedResponse } from "@/lib/api-utils";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { serviceDiscoveryQuerySchema } from "@/lib/validation";

/**
 * GET /api/services/discover
 *
 * Advanced service discovery with filtering, sorting, and full-text search.
 * Public endpoint — no wallet auth required.
 *
 * Query params:
 *   - category: filter by service category
 *   - minPrice / maxPrice: price range filter (micro-USDC)
 *   - status: filter by status (default: ACTIVE)
 *   - sortBy: price_asc | price_desc | newest | rating
 *   - q: full-text search on title + description
 *   - page / limit: pagination
 */
export async function GET(request: NextRequest) {
  try {
    publicLimiter.check(getClientIp(request));

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = serviceDiscoveryQuerySchema.parse(params);

    // Build WHERE clause
    const where: Prisma.ServiceOfferingWhereInput = {
      status: query.status,
    };

    if (query.category) {
      where.category = query.category;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.priceUsdc = {};
      if (query.minPrice !== undefined) {
        where.priceUsdc.gte = BigInt(query.minPrice);
      }
      if (query.maxPrice !== undefined) {
        where.priceUsdc.lte = BigInt(query.maxPrice);
      }
    }

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ];
    }

    // Build ORDER BY clause
    let orderBy: Prisma.ServiceOfferingOrderByWithRelationInput;
    switch (query.sortBy) {
      case "price_asc":
        orderBy = { priceUsdc: "asc" };
        break;
      case "price_desc":
        orderBy = { priceUsdc: "desc" };
        break;
      case "rating":
        // Sort by number of completed jobs as a proxy for popularity.
        // True rating-based sort would require a computed field or subquery.
        orderBy = { jobs: { _count: "desc" } };
        break;
      case "newest":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    const skip = (query.page - 1) * query.limit;

    const [services, total] = await Promise.all([
      prisma.serviceOffering.findMany({
        where,
        include: {
          provider: {
            select: { id: true, name: true, pfpUrl: true, walletAddress: true },
          },
          _count: { select: { jobs: { where: { status: "COMPLETED" } } } },
        },
        orderBy,
        skip,
        take: query.limit,
      }),
      prisma.serviceOffering.count({ where }),
    ]);

    // Serialize BigInt to string for JSON transport
    const serialized = services.map((s) => ({
      ...s,
      priceUsdc: s.priceUsdc.toString(),
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
