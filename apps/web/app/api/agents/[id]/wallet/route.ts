import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { successResponse, errorResponse } from '@/lib/api-utils';
import { Errors } from '@/lib/errors';

const walletConfigSchema = z.object({
  sessionLimit: z.number().positive().max(1000).optional(),
  txLimit: z.number().positive().max(100).optional(),
});

interface WalletStatusResponse {
  address: string | null;
  email: string | null;
  sessionLimit: number;
  txLimit: number;
  autoFund: boolean;
  totalSpent: string | null;
  transactionCount: number;
}

export const GET = withRateLimit(RATE_LIMITS.api, async (
  _request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: {
      walletAddress: true,
      walletEmail: true,
      walletSessionLimit: true,
      walletTxLimit: true,
      walletAutoFund: true,
      _count: {
        select: { walletTransactions: true },
      },
    },
  });

  if (!agent) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } },
      { status: 404 },
    );
  }

  // Calculate total spent from completed transactions
  const totalSpentResult = await prisma.walletTransaction.aggregate({
    where: { agentId: id, status: 'completed' },
    _sum: { amount: true },
  });

  const response: WalletStatusResponse = {
    address: agent.walletAddress,
    email: agent.walletEmail,
    sessionLimit: Number(agent.walletSessionLimit ?? 50),
    txLimit: Number(agent.walletTxLimit ?? 10),
    autoFund: agent.walletAutoFund,
    totalSpent: totalSpentResult._sum.amount?.toString() ?? '0',
    transactionCount: agent._count.walletTransactions,
  };

  return NextResponse.json({ success: true, data: response });
});

export const PATCH = withRateLimit(RATE_LIMITS.api, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  try {
    const { id } = await params;
    const body: unknown = await request.json();

    const parsed = walletConfigSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validationFailed(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { sessionLimit, txLimit } = parsed.data;

    // Verify agent exists
    const agent = await prisma.agent.findUnique({ where: { id }, select: { id: true } });
    if (!agent) {
      throw Errors.notFound('Agent');
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        ...(sessionLimit !== undefined && { walletSessionLimit: sessionLimit }),
        ...(txLimit !== undefined && { walletTxLimit: txLimit }),
      },
      select: {
        walletSessionLimit: true,
        walletTxLimit: true,
      },
    });

    return successResponse({
      sessionLimit: Number(updated.walletSessionLimit ?? 50),
      txLimit: Number(updated.walletTxLimit ?? 10),
    });
  } catch (err) {
    return errorResponse(err);
  }
});
