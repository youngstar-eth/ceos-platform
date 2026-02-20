import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, paginatedResponse, errorResponse } from "@/lib/api-utils";
import { verifyWalletSignature } from "@/lib/auth";
import { publicLimiter, authenticatedLimiter, getClientIp } from "@/lib/rate-limit";
import { listAgentsQuerySchema, createAgentSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// The canonical demo wallet — must match the frontend constant & seeded buyer agent.
const DEMO_WALLET = "0xDE00000000000000000000000000000000000001";

/**
 * GET /api/agents
 *
 * List agents with optional pagination and filters.
 * Public endpoint (rate-limited by IP).
 *
 * GOD MODE (DEMO_MODE):
 *   When a `creator` filter is provided but returns 0 results, we transparently
 *   inject the demo wallet's agents so the Hire Agent dropdown is never empty.
 *   This ensures E2E testing works regardless of which wallet MetaMask auto-connects.
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

    // ── GOD MODE: demo fallback ────────────────────────────────────────
    // If we're in demo mode and a creator filter yielded 0 results,
    // transparently return the demo wallet's agents instead.
    // This catches any wallet mismatch (MetaMask auto-connect, etc.)
    if (DEMO_MODE && query.creator && agents.length === 0) {
      logger.info(
        { requestedCreator: query.creator, demoWallet: DEMO_WALLET },
        "GOD MODE: No agents for requested creator — injecting demo wallet agents",
      );

      const demoWhere: Prisma.AgentWhereInput = {
        creatorAddress: DEMO_WALLET,
      };
      if (query.status) demoWhere.status = query.status;

      const [demoAgents, demoTotal] = await Promise.all([
        prisma.agent.findMany({
          where: demoWhere,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: { createdAt: "desc" },
          include: { identity: true },
        }),
        prisma.agent.count({ where: demoWhere }),
      ]);

      return paginatedResponse(demoAgents, {
        page: query.page,
        limit: query.limit,
        total: demoTotal,
      });
    }

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
