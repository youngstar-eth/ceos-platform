import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

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
