import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['x402_outbound', 'x402_inbound', 'deploy_fee', 'revenue_claim']).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
});

export const GET = withRateLimit(RATE_LIMITS.api, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  const { id } = await params;
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);

  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const query = parsed.data;

  const where = {
    agentId: id,
    ...(query.type && { type: query.type }),
    ...(query.status && { status: query.status }),
  };

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: transactions,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
});
