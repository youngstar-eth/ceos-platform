import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
// Types
// ---------------------------------------------------------------------------

interface DeployedAgent {
  id: string;
  name: string;
  farcasterFid: number;
  farcasterUsername: string;
  contractAddress: string;
  tokenId: string;
  status: 'deploying' | 'active';
  paidWithUsdc: boolean;
  paymentAmount: string;
  payer: string;
  createdAt: string;
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
 *   3. Call AgentFactory.deployAgent() on Base.
 *   4. Create Farcaster account via Neynar.
 *   5. Store agent config in PostgreSQL.
 *   6. Return the deployed agent details.
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

    // Step 3: Deploy on Base via AgentFactory
    // TODO: Wire up actual contract call via viem
    // const { hash, tokenId, contractAddress } = await deployOnChain(payer, agentConfig);
    const mockTokenId = `${Date.now()}`;
    const mockContractAddress = '0x0000000000000000000000000000000000000000';

    // Step 4: Create Farcaster account via Neynar
    // TODO: Wire up Neynar SDK
    // const { fid } = await createFarcasterAccount(agentConfig.farcasterUsername);
    const mockFid = Math.floor(Math.random() * 1_000_000);

    // Step 5: Store in database
    // TODO: Wire up Prisma
    // const agent = await prisma.agent.create({
    //   data: {
    //     name: agentConfig.name,
    //     description: agentConfig.description,
    //     personality: agentConfig.personality,
    //     postingStrategy: agentConfig.postingStrategy,
    //     topics: agentConfig.topics,
    //     imageStyle: agentConfig.imageStyle,
    //     farcasterUsername: agentConfig.farcasterUsername,
    //     farcasterFid: mockFid,
    //     contractAddress: mockContractAddress,
    //     tokenId: mockTokenId,
    //     owner: payer,
    //     paidWithUsdc: true,
    //     paymentAmount: amount ?? '10000000',
    //   },
    // });

    const deployedAgent: DeployedAgent = {
      id: crypto.randomUUID(),
      name: agentConfig.name,
      farcasterFid: mockFid,
      farcasterUsername: agentConfig.farcasterUsername,
      contractAddress: mockContractAddress,
      tokenId: mockTokenId,
      status: 'deploying',
      paidWithUsdc: true,
      paymentAmount: amount ?? '10000000',
      payer,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(
      {
        success: true,
        data: deployedAgent,
      },
      { status: 201 }
    );
  } catch (err) {
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
