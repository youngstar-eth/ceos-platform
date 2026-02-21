/**
 * Trinity Deployer — Sovereign Identity Pipeline for AI Agents
 *
 * Orchestrates the "Holy Trinity" deployment: CDP wallet + Farcaster FID + ERC-8004 NFT.
 * Each step is independently idempotent and recoverable. If the pipeline crashes
 * mid-way, trinityStatus tracks exactly where it stopped for retry.
 *
 * Saga Pattern:
 *   Step A: Provision CDP Wallet     → trinityStatus = CDP_ONLY
 *   Step B: Create Farcaster Account → trinityStatus = CDP_FARCASTER
 *   Step C: Mint ERC-8004 Identity   → trinityStatus = COMPLETE
 *
 * Demo Mode:
 *   When NEXT_PUBLIC_DEMO_MODE=true, each step generates valid-looking
 *   mock data so the E2E flow isn't blocked by API keys, gas, or rate limits.
 *
 * Architecture:
 *   This service is called from the deploy route (POST /api/agents/deploy)
 *   but lives in agent-runtime because it interacts with on-chain contracts
 *   and external APIs (Neynar, CDP) that belong to the backend.
 */

import type { PrismaClient, TrinityStatus } from '@prisma/client';
import type pino from 'pino';
import { DEFAULT_STARTING_SCORE } from './reputation-calculator.js';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Result of a single CDP wallet provisioning step */
export interface CdpResult {
  walletId: string;
  walletAddress: string;
  walletEmail: string;
  network: string;
}

/** Result of a single Farcaster account creation step */
export interface FarcasterResult {
  fid: number;
  signerUuid: string;
  username: string;
  custodyAddress: string;
}

/** Result of a single ERC-8004 identity minting step */
export interface Erc8004Result {
  tokenId: number;
  agentUri: string;
  mintTxHash: string | null; // null in demo mode
}

/** Full result of the Trinity deploy pipeline */
export interface TrinityDeployResult {
  trinityStatus: TrinityStatus;
  cdp: CdpResult | null;
  farcaster: FarcasterResult | null;
  erc8004: Erc8004Result | null;
  errors: string[];
}

/** Input for deploying an agent's Trinity identity */
export interface TrinityDeployInput {
  agentId: string;
  agentName: string;
  description: string | null;
  persona: Record<string, unknown>;
  skills: string[];
  creatorAddress: string;
}

/** Callbacks for external service integrations (dependency injection) */
export interface TrinityDeps {
  /** Provision a CDP wallet — returns wallet metadata */
  provisionWallet: (agentId: string, agentName: string) => Promise<CdpResult>;
  /** Create a Farcaster account — returns FID + signer */
  createFarcasterAccount: (options: {
    walletId: string;
    username: string;
    displayName: string;
    bio: string;
    pfpUrl?: string;
    agentId: string;
  }) => Promise<FarcasterResult>;
  /** Mint ERC-8004 identity on-chain — returns token ID + tx hash */
  mintErc8004Identity: (
    walletAddress: string,
    agentUri: string,
  ) => Promise<{ tokenId: number; txHash: string }>;
}

// ── Demo Mode Mocks ─────────────────────────────────────────────────────────

function mockCdpResult(agentId: string): CdpResult {
  // Generate a deterministic-looking hex address from the agentId
  const hexSuffix = Buffer.from(agentId).toString('hex').slice(0, 38).padEnd(38, '0');
  return {
    walletId: `mock-wallet-${agentId.slice(0, 8)}`,
    walletAddress: `0xCD${hexSuffix}`,
    walletEmail: `${agentId}@agents.ceos.run`,
    network: 'base-sepolia',
  };
}

function mockFarcasterResult(agentName: string): FarcasterResult {
  const username = agentName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12);

  return {
    fid: 800_000 + Math.floor(Math.random() * 100_000),
    signerUuid: `demo-signer-${crypto.randomUUID()}`,
    username: `${username}-${Math.floor(Math.random() * 9000 + 1000)}`,
    custodyAddress: `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
  };
}

function mockErc8004Result(agentId: string): Erc8004Result {
  return {
    tokenId: Math.floor(Math.random() * 900_000) + 100_000,
    agentUri: buildAgentUri(agentId, 'mock-wallet', 0, []),
    mintTxHash: null, // No on-chain tx in demo mode
  };
}

// ── Agent URI Builder ───────────────────────────────────────────────────────

/**
 * Build the agentURI for on-chain identity registration.
 *
 * The URI is a compact JSON string containing the minimum metadata needed
 * to identify and discover an agent. It's stored on-chain in the ERC-8004
 * identity NFT and serves as the "business card" of the agent.
 *
 * Format: JSON with { version, agentId, walletAddress, fid, skills, platform }
 */
export function buildAgentUri(
  agentId: string,
  walletAddress: string,
  fid: number,
  skills: string[],
): string {
  const uri = {
    version: '1.0',
    platform: 'ceos.run',
    agentId,
    walletAddress,
    fid,
    skills: skills.slice(0, 5), // Cap at 5 skills to keep URI compact
    registeredAt: new Date().toISOString(),
  };

  return JSON.stringify(uri);
}

// ── The Trinity Deployer ────────────────────────────────────────────────────

/**
 * Execute the Trinity deployment pipeline for an agent.
 *
 * This is the main entry point. It runs three steps sequentially,
 * persisting progress after each step so crashes are recoverable.
 *
 * The pipeline is designed to be **re-entrant**: if called again for an
 * agent that already has some identities, it skips completed steps and
 * picks up where it left off.
 */
export async function deployTrinity(
  prisma: PrismaClient,
  input: TrinityDeployInput,
  deps: TrinityDeps,
  demoMode: boolean,
  logger: pino.Logger,
): Promise<TrinityDeployResult> {
  const { agentId, agentName } = input;
  const errors: string[] = [];

  logger.info(
    { agentId, agentName, demoMode },
    'Trinity Deployer: starting pipeline',
  );

  // Check current trinity status for re-entrancy
  const currentAgent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      trinityStatus: true,
      walletId: true,
      walletAddress: true,
      fid: true,
      signerUuid: true,
      erc8004TokenId: true,
    },
  });

  if (!currentAgent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  let trinityStatus: TrinityStatus = currentAgent.trinityStatus;
  let cdpResult: CdpResult | null = null;
  let farcasterResult: FarcasterResult | null = null;
  let erc8004Result: Erc8004Result | null = null;

  // ── Step A: CDP Wallet ──────────────────────────────────────────────────
  if (trinityStatus === 'NONE') {
    try {
      if (demoMode) {
        cdpResult = mockCdpResult(agentId);
        logger.info({ agentId, mock: true }, 'Trinity Step A: CDP wallet mocked');
      } else {
        cdpResult = await deps.provisionWallet(agentId, agentName);
        logger.info(
          { agentId, walletAddress: cdpResult.walletAddress },
          'Trinity Step A: CDP wallet provisioned',
        );
      }

      // Persist CDP wallet data
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          walletId: cdpResult.walletId,
          walletAddress: cdpResult.walletAddress,
          walletEmail: cdpResult.walletEmail,
          trinityStatus: 'CDP_ONLY',
        },
      });

      trinityStatus = 'CDP_ONLY';
    } catch (err) {
      const errMsg = `CDP provisioning failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errMsg);
      logger.error({ agentId, error: errMsg }, 'Trinity Step A: FAILED');
      // Pipeline stops here — can't create Farcaster or ERC-8004 without a wallet
      return { trinityStatus, cdp: null, farcaster: null, erc8004: null, errors };
    }
  } else if (currentAgent.walletId && currentAgent.walletAddress) {
    // Re-entering: CDP already provisioned
    cdpResult = {
      walletId: currentAgent.walletId,
      walletAddress: currentAgent.walletAddress,
      walletEmail: '', // Not critical for re-entry
      network: '',
    };
    logger.info({ agentId }, 'Trinity Step A: CDP wallet already exists — skipping');
  }

  // ── Step B: Farcaster Account ────────────────────────────────────────────
  if (trinityStatus === 'CDP_ONLY' && cdpResult) {
    try {
      if (demoMode) {
        farcasterResult = mockFarcasterResult(agentName);
        logger.info({ agentId, mock: true, fid: farcasterResult.fid }, 'Trinity Step B: Farcaster mocked');
      } else {
        const username = agentName
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 12);

        const persona = input.persona?.description as string ?? '';

        farcasterResult = await deps.createFarcasterAccount({
          walletId: cdpResult.walletId,
          username: `${username}-${Math.floor(Math.random() * 9000 + 1000)}`,
          displayName: agentName,
          bio: persona.slice(0, 160) || 'AI agent on Farcaster | Powered by ceos.run',
          agentId,
        });

        logger.info(
          { agentId, fid: farcasterResult.fid, username: farcasterResult.username },
          'Trinity Step B: Farcaster account created',
        );
      }

      // Persist Farcaster data
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          fid: farcasterResult.fid,
          signerUuid: farcasterResult.signerUuid,
          onChainAddress: farcasterResult.custodyAddress,
          trinityStatus: 'CDP_FARCASTER',
        },
      });

      trinityStatus = 'CDP_FARCASTER';
    } catch (err) {
      const errMsg = `Farcaster creation failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errMsg);
      logger.error({ agentId, error: errMsg }, 'Trinity Step B: FAILED');
      // Pipeline stops — ERC-8004 needs FID for the agentURI
      return { trinityStatus, cdp: cdpResult, farcaster: null, erc8004: null, errors };
    }
  } else if (currentAgent.fid && currentAgent.signerUuid) {
    // Re-entering: Farcaster already created
    farcasterResult = {
      fid: currentAgent.fid,
      signerUuid: currentAgent.signerUuid,
      username: '', // Not critical for re-entry
      custodyAddress: '',
    };
    logger.info({ agentId, fid: currentAgent.fid }, 'Trinity Step B: Farcaster already exists — skipping');
  }

  // ── Step C: ERC-8004 Identity Mint ──────────────────────────────────────
  if (trinityStatus === 'CDP_FARCASTER' && cdpResult && farcasterResult) {
    try {
      const agentUri = buildAgentUri(
        agentId,
        cdpResult.walletAddress,
        farcasterResult.fid,
        input.skills,
      );

      if (demoMode) {
        erc8004Result = mockErc8004Result(agentId);
        erc8004Result.agentUri = agentUri;
        logger.info(
          { agentId, mock: true, tokenId: erc8004Result.tokenId },
          'Trinity Step C: ERC-8004 identity mocked',
        );
      } else {
        const { tokenId, txHash } = await deps.mintErc8004Identity(
          cdpResult.walletAddress,
          agentUri,
        );

        erc8004Result = { tokenId, agentUri, mintTxHash: txHash };

        logger.info(
          { agentId, tokenId, txHash },
          'Trinity Step C: ERC-8004 identity minted on-chain',
        );
      }

      // Persist ERC-8004 data + create ERC8004Identity record atomically
      await prisma.$transaction([
        prisma.agent.update({
          where: { id: agentId },
          data: {
            erc8004TokenId: erc8004Result.tokenId,
            tokenId: erc8004Result.tokenId,
            agentUri: erc8004Result.agentUri,
            trinityStatus: 'COMPLETE',
            trinityMintTx: erc8004Result.mintTxHash,
            trinityLinkedAt: new Date(),
          },
        }),
        prisma.eRC8004Identity.create({
          data: {
            agentId,
            tokenId: erc8004Result.tokenId,
            agentUri: erc8004Result.agentUri,
            reputationScore: DEFAULT_STARTING_SCORE,
            registrationJson: {
              walletAddress: cdpResult.walletAddress,
              fid: farcasterResult.fid,
              skills: input.skills,
              deployedAt: new Date().toISOString(),
              demoMode,
            },
          },
        }),
      ]);

      trinityStatus = 'COMPLETE';
    } catch (err) {
      const errMsg = `ERC-8004 mint failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errMsg);
      logger.error({ agentId, error: errMsg }, 'Trinity Step C: FAILED');
      return { trinityStatus, cdp: cdpResult, farcaster: farcasterResult, erc8004: null, errors };
    }
  } else if (currentAgent.erc8004TokenId) {
    // Re-entering: ERC-8004 already minted
    erc8004Result = {
      tokenId: currentAgent.erc8004TokenId,
      agentUri: '',
      mintTxHash: null,
    };
    logger.info(
      { agentId, tokenId: currentAgent.erc8004TokenId },
      'Trinity Step C: ERC-8004 already exists — skipping',
    );
  }

  // ── Pipeline Complete ──────────────────────────────────────────────────
  logger.info(
    {
      agentId,
      trinityStatus,
      hasWallet: !!cdpResult,
      hasFarcaster: !!farcasterResult,
      hasErc8004: !!erc8004Result,
      errorCount: errors.length,
    },
    'Trinity Deployer: pipeline complete',
  );

  return {
    trinityStatus,
    cdp: cdpResult,
    farcaster: farcasterResult,
    erc8004: erc8004Result,
    errors,
  };
}
