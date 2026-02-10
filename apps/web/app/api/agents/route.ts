import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, paginatedResponse, errorResponse } from "@/lib/api-utils";
import { verifyWalletSignature } from "@/lib/auth";
import { publicLimiter, authenticatedLimiter, getClientIp } from "@/lib/rate-limit";
import { listAgentsQuerySchema, createAgentSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/agents
 *
 * List agents with optional pagination and filters.
 * Public endpoint (rate-limited by IP).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = listAgentsQuerySchema.parse(params);

    const where: Prisma.AgentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.creator) where.creatorAddress = query.creator;

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: { identity: true },
      }),
      prisma.agent.count({ where }),
    ]);

    return paginatedResponse(agents, {
      page: query.page,
      limit: query.limit,
      total,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/agents
 *
 * Create a new agent configuration.
 * Requires wallet signature authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = createAgentSchema.parse(body);

    const agent = await prisma.agent.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        creatorAddress: address,
        persona: data.persona,
        skills: data.skills,
        strategy: data.strategy,
      },
    });

    logger.info({ agentId: agent.id, creator: address }, "Agent created");

    return successResponse(agent, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
