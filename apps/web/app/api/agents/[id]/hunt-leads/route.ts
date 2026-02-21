import { NextRequest } from 'next/server';
import { SocialHuntStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { paginatedResponse, errorResponse } from '@/lib/api-utils';
import { Errors } from '@/lib/errors';
import { verifyWalletSignature } from '@/lib/auth';
import { authenticatedLimiter } from '@/lib/rate-limit';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id]/hunt-leads
 *
 * Retrieve Social Hunter leads for an agent's dashboard.
 *
 * Query params:
 *   - status  (optional): Filter by SocialHuntStatus
 *   - page    (optional): Page number (default 1)
 *   - limit   (optional): Items per page (default 20, max 50)
 *
 * Auth: Wallet signature required. Only the agent creator can view leads.
 * Demo mode: Any wallet can view any agent's leads.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);
    const { id: agentId } = await context.params;

    // Verify agent exists + ownership
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { creatorAddress: true },
    });

    if (!agent) throw Errors.notFound('Agent');
    if (!DEMO_MODE && agent.creatorAddress !== address) {
      throw Errors.forbidden('Only the agent creator can view hunt leads');
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')));

    // Validate status enum if provided
    const status =
      statusParam && Object.values(SocialHuntStatus).includes(statusParam as SocialHuntStatus)
        ? (statusParam as SocialHuntStatus)
        : undefined;

    const where = {
      agentId,
      ...(status ? { status } : {}),
    };

    const [leads, total] = await Promise.all([
      prisma.socialHuntLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.socialHuntLead.count({ where }),
    ]);

    return paginatedResponse(leads, { page, limit, total });
  } catch (err) {
    return errorResponse(err);
  }
}
