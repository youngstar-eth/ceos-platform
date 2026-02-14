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
  usdcBalance: string | null;
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

  // Fetch on-chain USDC balance if wallet exists
  let usdcBalance: string | null = null;
  if (agent.walletAddress) {
    try {
      const { createPublicClient, http } = await import('viem');
      const { base, baseSepolia } = await import('viem/chains');
      const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
      const chain = chainId === 8453 ? base : baseSepolia;
      const rpcUrl = chainId === 8453
        ? (process.env.BASE_RPC_URL ?? 'https://mainnet.base.org')
        : (process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org');
      const client = createPublicClient({ chain, transport: http(rpcUrl) });

      const USDC_ADDRESS = chainId === 8453
        ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
        : '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
      const balance = await client.readContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: [{
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
        }],
        functionName: 'balanceOf',
        args: [agent.walletAddress as `0x${string}`],
      });
      usdcBalance = (Number(balance) / 1e6).toFixed(6);
    } catch {
      usdcBalance = null;
    }
  }

  const response: WalletStatusResponse = {
    address: agent.walletAddress,
    email: agent.walletEmail,
    sessionLimit: Number(agent.walletSessionLimit ?? 50),
    txLimit: Number(agent.walletTxLimit ?? 10),
    autoFund: agent.walletAutoFund,
    totalSpent: totalSpentResult._sum.amount?.toString() ?? '0',
    transactionCount: agent._count.walletTransactions,
    usdcBalance,
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
