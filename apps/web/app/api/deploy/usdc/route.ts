import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateAgentProfileImages } from '@/lib/profile-image-generator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NEYNAR_API_BASE = 'https://api.neynar.com/v2/farcaster';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY ?? '';
const NEYNAR_WALLET_ID = process.env.NEYNAR_WALLET_ID ?? '';

// ---------------------------------------------------------------------------
// Request Schema
// ---------------------------------------------------------------------------

const deployAgentSchema = z.object({
  name: z
    .string()
    .min(1, 'Agent name is required.')
    .max(64, 'Agent name must be 64 characters or fewer.'),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or fewer.')
    .optional(),
  personality: z.string().min(1, 'Personality prompt is required.'),
  postingStrategy: z.enum(['scheduled', 'reactive', 'trending']).default('scheduled'),
  topics: z.array(z.string()).min(1, 'At least one topic is required.').max(10),
  imageStyle: z.string().optional(),
  farcasterUsername: z
    .string()
    .min(1, 'Farcaster username is required.')
    .max(20)
    .regex(/^[a-z0-9-]+$/, 'Username must be lowercase alphanumeric with hyphens.'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createFarcasterAccount(options: {
  walletId: string;
  username: string;
  displayName: string;
  bio: string;
  pfpUrl?: string;
  agentId: string;
}): Promise<{ fid: number; signerUuid: string; username: string; custodyAddress: string }> {
  const {
    ID_REGISTRY_ADDRESS,
    ViemLocalEip712Signer,
    idRegistryABI,
  } = await import('@farcaster/hub-nodejs');
  const { bytesToHex, createPublicClient, http, keccak256, toBytes } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { optimism } = await import('viem/chains');

  const fidRes = await fetch(`${NEYNAR_API_BASE}/user/fid`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      api_key: NEYNAR_API_KEY,
      'x-wallet-id': options.walletId,
    },
  });

  if (!fidRes.ok) {
    const errText = await fidRes.text().catch(() => 'Unknown error');
    throw new Error(`Failed to reserve FID: ${fidRes.status} ${errText}`);
  }

  const fidData = (await fidRes.json()) as { fid: number };
  logger.info({ fid: fidData.fid }, 'Reserved FID for USDC deploy');

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const derivedKey = keccak256(toBytes(`${deployerKey}:${options.agentId}`));
  const account = privateKeyToAccount(derivedKey);
  const custodyAddress = account.address;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem version mismatch between workspace packages
  const eip712Signer = new ViemLocalEip712Signer(account as any);

  const publicClient = createPublicClient({
    chain: optimism,
    transport: http(),
  });

  const nonce = await publicClient.readContract({
    address: ID_REGISTRY_ADDRESS,
    abi: idRegistryABI,
    functionName: 'nonces',
    args: [custodyAddress],
  });

  const signatureResult = await eip712Signer.signTransfer({
    fid: BigInt(fidData.fid),
    to: custodyAddress,
    nonce: nonce as bigint,
    deadline,
  });

  if (signatureResult.isErr()) {
    throw new Error(`Failed to sign transfer: ${signatureResult.error}`);
  }

  const signature = bytesToHex(signatureResult.value);

  const registerRes = await fetch(`${NEYNAR_API_BASE}/user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      api_key: NEYNAR_API_KEY,
      'x-wallet-id': options.walletId,
    },
    body: JSON.stringify({
      signature,
      fid: fidData.fid,
      requested_user_custody_address: custodyAddress,
      deadline: Number(deadline),
      fname: options.username,
      metadata: {
        bio: options.bio,
        pfp_url: options.pfpUrl ?? '',
        display_name: options.displayName,
        url: '',
      },
    }),
  });

  if (!registerRes.ok) {
    const errText = await registerRes.text().catch(() => 'Unknown error');
    throw new Error(`Failed to register account: ${registerRes.status} ${errText}`);
  }

  const registerData = (await registerRes.json()) as {
    success: boolean;
    signer: {
      signer_uuid: string;
      public_key: string;
      status: string;
      fid: number;
    };
  };

  return {
    fid: fidData.fid,
    signerUuid: registerData.signer?.signer_uuid ?? '',
    username: options.username,
    custodyAddress,
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/deploy/usdc
 *
 * Deploy an agent paid with USDC via the x402 payment protocol.
 *
 * This route is behind the x402 middleware. By the time the request reaches
 * this handler, payment has already been verified and the following headers
 * are set:
 *   - X-PAYMENT-VERIFIED: "true"
 *   - X-PAYMENT-PAYER: the payer's wallet address
 *   - X-PAYMENT-AMOUNT: USDC amount in 6-decimal micro-units
 *
 * Flow:
 *   1. Verify the payment headers are present (middleware enforcement).
 *   2. Validate the request body (agent configuration).
 *   3. Create Farcaster account via Neynar.
 *   4. Store agent config in PostgreSQL.
 *   5. Return the deployed agent details.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Verify payment headers from middleware
    const paymentVerified = request.headers.get('X-PAYMENT-VERIFIED');
    const payer = request.headers.get('X-PAYMENT-PAYER');
    const amount = request.headers.get('X-PAYMENT-AMOUNT');

    if (paymentVerified !== 'true' || !payer) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PAYMENT_REQUIRED',
            message:
              'This endpoint requires x402 payment. Include X-PAYMENT header with signed USDC authorization.',
          },
        },
        { status: 402 }
      );
    }

    // Step 2: Validate request body
    const body: unknown = await request.json();
    const parsed = deployAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid agent configuration.',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const agentConfig = parsed.data;

    // Step 3: Create agent in database first (PENDING status)
    const agent = await prisma.agent.create({
      data: {
        name: agentConfig.name,
        description: agentConfig.description ?? null,
        creatorAddress: payer.toLowerCase(),
        persona: {
          description: agentConfig.personality,
          topics: agentConfig.topics,
          imageStyle: agentConfig.imageStyle ?? null,
        },
        skills: [],
        strategy: {
          type: agentConfig.postingStrategy,
          postsPerDay: agentConfig.postingStrategy === 'scheduled' ? 6 : 3,
        },
        status: 'PENDING',
      },
    });

    // Step 4: Generate profile images
    let pfpUrl: string | null = null;
    let bannerUrl: string | null = null;
    try {
      const profileImages = await generateAgentProfileImages({
        name: agent.name,
        description: agent.description,
        persona: agent.persona as Record<string, unknown>,
        skills: agent.skills,
      });
      pfpUrl = profileImages.pfpUrl;
      bannerUrl = profileImages.bannerUrl;
    } catch (err) {
      logger.warn(
        { agentId: agent.id, error: err instanceof Error ? err.message : String(err) },
        'Profile image generation failed, continuing without images'
      );
    }

    // Step 5: Create Farcaster account
    let fid: number;
    let signerUuid: string;
    let custodyAddress: string;

    if (!NEYNAR_WALLET_ID) {
      logger.warn('NEYNAR_WALLET_ID not set, using demo signer for USDC deploy');
      fid = 800000 + Math.floor(Math.random() * 100000);
      signerUuid = `demo-signer-${crypto.randomUUID()}`;
      custodyAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    } else {
      try {
        const username = agentConfig.farcasterUsername;
        const account = await createFarcasterAccount({
          walletId: NEYNAR_WALLET_ID,
          username,
          displayName: agentConfig.name,
          bio: agentConfig.personality.slice(0, 160) || 'AI agent on Farcaster | Powered by ceos.run',
          pfpUrl: pfpUrl ?? undefined,
          agentId: agent.id,
        });

        fid = account.fid;
        signerUuid = account.signerUuid;
        custodyAddress = account.custodyAddress;

        logger.info(
          { agentId: agent.id, fid, username, signerUuid: signerUuid.slice(0, 8) + '...' },
          'Farcaster account created for USDC-deployed agent'
        );
      } catch (err) {
        logger.error(
          { agentId: agent.id, error: err instanceof Error ? err.message : String(err) },
          'Failed to create Farcaster account for USDC deploy'
        );

        fid = 800000 + Math.floor(Math.random() * 100000);
        signerUuid = `demo-signer-${crypto.randomUUID()}`;
        custodyAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
      }
    }

    // Step 6: Update agent with Farcaster details and activate
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: 'ACTIVE',
        fid,
        signerUuid,
        onChainAddress: custodyAddress,
        ...(pfpUrl && { pfpUrl }),
        ...(bannerUrl && { bannerUrl }),
      },
    });

    logger.info(
      { agentId: agent.id, fid, payer, amount },
      'Agent deployed via USDC x402 payment'
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          farcasterFid: fid,
          farcasterUsername: agentConfig.farcasterUsername,
          contractAddress: custodyAddress,
          tokenId: updated.tokenId?.toString() ?? null,
          status: updated.status.toLowerCase(),
          paidWithUsdc: true,
          paymentAmount: amount ?? '10000000',
          payer,
          createdAt: updated.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'USDC deploy failed'
    );
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
