import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { metricsQuerySchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id]/metrics
 *
 * Retrieve metrics for an agent, optionally filtered by epoch.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const { id } = await context.params;

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      throw Errors.notFound("Agent");
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = metricsQuerySchema.parse(params);

    const where: { agentId: string; epoch?: number } = { agentId: id };
    if (query.epoch !== undefined) {
      where.epoch = query.epoch;
    }

    const metrics = await prisma.agentMetrics.findMany({
      where,
      orderBy: { epoch: "desc" },
    });

    return successResponse(metrics);
  } catch (err) {
    return errorResponse(err);
  }
}
