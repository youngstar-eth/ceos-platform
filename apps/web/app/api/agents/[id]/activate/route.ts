export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from '@/lib/api-utils';
import { Errors } from '@/lib/errors';
import { verifyWalletSignature } from '@/lib/auth';
import { authenticatedLimiter } from '@/lib/rate-limit';
import { getFarcasterUser } from '@/lib/neynar';

// ---------------------------------------------------------------------------
// POST /api/agents/[id]/activate
//
// "Activate" an agent by linking a Farcaster handle and creating a CDP MPC
// wallet via Coinbase AgentKit.  The MPC wallet eliminates the security risk
// of storing raw private keys — key material never exists in one place.
//
// Body: { farcasterUsername: string }
// ---------------------------------------------------------------------------

/** Wallet spending policy — configurable guardrails for autonomous agent wallets. */
const walletPolicySchema = z
  .object({
    spendLimit: z
      .object({
        amount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
        currency: z.enum(['ETH', 'USDC']).default('ETH'),
        period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
      })
      .optional(),
    whitelist: z
      .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'))
      .optional(),
    approvalRequiredFor: z
      .array(z.string())
      .optional(),
  })
  .optional();

const activateBodySchema = z.object({
  /** The Farcaster username to link (without @). */
  farcasterUsername: z
    .string()
    .min(1, 'Farcaster username is required')
    .regex(/^[a-z0-9._-]+$/i, 'Invalid Farcaster username format')
    .transform((v) => v.toLowerCase().replace(/^@/, '')),
  /** Optional wallet policy for autonomous operation guardrails. */
  walletPolicy: walletPolicySchema,
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const { id } = await context.params;
    const body: unknown = await request.json();
    const { farcasterUsername, walletPolicy } = activateBodySchema.parse(body);

    // ── 1. Validate agent ────────────────────────────────────────────────

    const agent = await prisma.agent.findUnique({ where: { id } });

    if (!agent) {
      throw Errors.notFound('Agent');
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden('Only the creator can activate this agent');
    }

    if (agent.status !== 'PENDING' && agent.status !== 'DEPLOYING') {
      throw Errors.conflict(
        `Agent cannot be activated from status "${agent.status}". Only PENDING or DEPLOYING agents can be activated.`,
      );
    }

    // ── 2. Fetch real Farcaster profile via Neynar ───────────────────────

    const profile = await getFarcasterUser(farcasterUsername);

    if (!profile) {
      throw Errors.notFound(
        `Farcaster user @${farcasterUsername} not found. Please check the username and try again.`,
      );
    }

    logger.info(
      { agentId: id, fid: profile.fid, username: profile.username },
      'Farcaster profile fetched for activation',
    );

    // ── 3. Create CDP Wallet via AgentKit ────────────────────────────────
    //
    // Instead of generating a raw private key, we create a server-managed
    // wallet through Coinbase's AgentKit.  The private key lives in
    // Coinbase's infrastructure and is never exposed to our application.
    //
    // Dynamic import avoids webpack bundling issues with native ESM deps.

    let walletAddress: string;
    let exportedWalletData: unknown;

    try {
      logger.info({ agentId: id }, 'Importing AgentKit module…');
      const { getAgentKit } = await import('@/lib/agent-kit');

      logger.info({ agentId: id }, 'Creating CDP wallet via AgentKit…');
      const { walletProvider } = await getAgentKit();

      walletAddress = walletProvider.getAddress();
      exportedWalletData = await walletProvider.exportWallet();

      logger.info(
        { agentId: id, walletAddress },
        'CDP wallet created for agent',
      );
    } catch (cdpError) {
      logger.error(
        {
          agentId: id,
          cdpError,
          message: cdpError instanceof Error ? cdpError.message : String(cdpError),
          stack: cdpError instanceof Error ? cdpError.stack : undefined,
          hasCdpKeyName: !!process.env.CDP_API_KEY_NAME,
          hasCdpKeyPrivate: !!process.env.CDP_API_KEY_PRIVATE_KEY,
        },
        'CDP wallet creation failed — AgentKit error',
      );
      throw cdpError;
    }

    // ── 4. Update agent in database ──────────────────────────────────────

    // Build default policy if none provided
    const defaultPolicy = {
      spendLimit: { amount: '0.01', currency: 'ETH', period: 'daily' },
      whitelist: [],
      approvalRequiredFor: ['Withdraw', 'Transfer'],
    };
    const effectivePolicy = walletPolicy ?? defaultPolicy;

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        fid: profile.fid,
        farcasterUsername: profile.username,
        pfpUrl: profile.pfpUrl ?? agent.pfpUrl,
        walletAddress,
        cdpWalletData: JSON.stringify(exportedWalletData),
        walletPolicy: effectivePolicy,
        lastFollowerCount: profile.followerCount,
      },
    });

    logger.info(
      {
        agentId: id,
        fid: profile.fid,
        username: profile.username,
        walletAddress,
        creator: address,
      },
      'Agent activated with real Farcaster profile + CDP MPC wallet',
    );

    return successResponse(
      {
        agent: {
          id: updated.id,
          name: updated.name,
          status: updated.status,
          fid: updated.fid,
          farcasterUsername: updated.farcasterUsername,
          pfpUrl: updated.pfpUrl,
          walletAddress: updated.walletAddress,
        },
        farcasterProfile: {
          fid: profile.fid,
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio,
          pfpUrl: profile.pfpUrl,
          followerCount: profile.followerCount,
          followingCount: profile.followingCount,
        },
        message: `Agent activated! Linked to @${profile.username} (FID: ${profile.fid}) with CDP wallet ${walletAddress}`,
      },
      200,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
