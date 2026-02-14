import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api-utils';
import { Errors } from '@/lib/errors';
import { verifyWalletSignature } from '@/lib/auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const POST = withRateLimit(RATE_LIMITS.deploy, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
) => {
  try {
    const address = await verifyWalletSignature(request);
    const { id } = await params;

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        creatorAddress: true,
        walletAddress: true,
      },
    });

    if (!agent) {
      throw Errors.notFound('Agent');
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden('Only the creator can fund this agent');
    }

    if (!agent.walletAddress) {
      throw Errors.badRequest('Agent does not have a wallet provisioned');
    }

    // Only testnet faucet is supported
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
    if (chainId === 8453) {
      throw Errors.badRequest('Mainnet funding requires manual USDC transfer');
    }

    const { fundAgentWallet } = await import('@/lib/awal');

    // Find the walletId from a prior transaction or provision record
    // For now, use a placeholder — real implementation would store walletId in agent record
    const txResult = await fundAgentWallet(agent.id, '10', 'usdc');

    // Record the fund transaction
    await prisma.walletTransaction.create({
      data: {
        agentId: id,
        type: 'fund',
        amount: 10,
        currency: 'USDC',
        status: 'completed',
        txHash: txResult.txHash,
        metadata: { source: 'faucet', network: 'base-sepolia' },
      },
    });

    logger.info({ agentId: id, txHash: txResult.txHash }, 'Agent wallet funded via faucet');

    return successResponse({
      txHash: txResult.txHash,
      amount: '10',
      currency: 'USDC',
      source: 'faucet',
    }, 201);
  } catch (err) {
    return errorResponse(err);
  }
});
