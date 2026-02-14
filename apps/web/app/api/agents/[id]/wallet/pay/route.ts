import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api-utils';
import { Errors } from '@/lib/errors';
import { verifyWalletSignature } from '@/lib/auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const paymentSchema = z.object({
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  serviceUrl: z.string().url(),
  reason: z.string().max(500),
});

export const POST = withRateLimit(RATE_LIMITS.api, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
) => {
  try {
    const address = await verifyWalletSignature(request);
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validationFailed(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { recipientAddress, amount, serviceUrl, reason } = parsed.data;

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        creatorAddress: true,
        walletAddress: true,
        walletSessionLimit: true,
        walletTxLimit: true,
      },
    });

    if (!agent) {
      throw Errors.notFound('Agent');
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden('Only the creator can authorize payments');
    }

    if (!agent.walletAddress) {
      throw Errors.badRequest('Agent does not have a wallet provisioned');
    }

    // Check transaction count limit (within last 24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTxCount = await prisma.walletTransaction.count({
      where: {
        agentId: agent.id,
        createdAt: { gte: dayAgo },
      },
    });

    const txLimit = Number(agent.walletTxLimit ?? 10);
    if (recentTxCount >= txLimit) {
      throw Errors.rateLimited();
    }

    const { executeX402Payment } = await import('@/lib/awal');
    const result = await executeX402Payment(agent.id, recipientAddress, amount, serviceUrl);

    // Record the payment transaction
    await prisma.walletTransaction.create({
      data: {
        agent: { connect: { id: agent.id } },
        type: 'x402_outbound',
        amount: parseFloat(amount),
        currency: 'USDC',
        status: 'completed',
        txHash: result.txHash,
        metadata: {
          recipient: recipientAddress,
          serviceUrl,
          reason,
        },
      },
    });

    logger.info(
      { agentId: id, recipient: recipientAddress, amount, serviceUrl },
      'x402 payment executed',
    );

    return successResponse({
      txHash: result.txHash,
      amount,
      recipient: recipientAddress,
    }, 201);
  } catch (err) {
    return errorResponse(err);
  }
});
