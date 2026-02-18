export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse, sanitizeAgent } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { publicLimiter, authenticatedLimiter, getClientIp } from "@/lib/rate-limit";
import { updateAgentSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id]
 *
 * Retrieve a single agent by ID.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const { id } = await context.params;

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        identity: true,
        casts: { take: 10, orderBy: { createdAt: "desc" } },
        metrics: { take: 5, orderBy: { epoch: "desc" } },
      },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    return successResponse(sanitizeAgent(agent as unknown as Record<string, unknown>));
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PUT /api/agents/[id]
 *
 * Update an agent. Only the creator can update.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { id } = await context.params;

    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      throw Errors.notFound("Agent");
    }
    if (existing.creatorAddress !== address) {
      throw Errors.forbidden("Only the creator can update this agent");
    }

    const body: unknown = await request.json();
    const data = updateAgentSchema.parse(body);

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.persona !== undefined && { persona: data.persona }),
        ...(data.skills !== undefined && { skills: data.skills }),
        ...(data.strategy !== undefined && { strategy: data.strategy }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });

    logger.info({ agentId: id, updatedBy: address }, "Agent updated");

    return successResponse(updated);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/agents/[id]
 *
 * Soft-delete an agent by setting status to TERMINATED.
 * Only the creator can terminate.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { id } = await context.params;

    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      throw Errors.notFound("Agent");
    }
    if (existing.creatorAddress !== address) {
      throw Errors.forbidden("Only the creator can terminate this agent");
    }

    const terminated = await prisma.agent.update({
      where: { id },
      data: { status: "TERMINATED" },
    });

    logger.info({ agentId: id, terminatedBy: address }, "Agent terminated");

    return successResponse(terminated);
  } catch (err) {
    return errorResponse(err);
  }
}