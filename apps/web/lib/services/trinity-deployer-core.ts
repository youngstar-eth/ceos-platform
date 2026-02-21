/**
 * Trinity Deployer Core — Web-side deployment orchestrator
 *
 * This is the deployment pipeline logic, designed to be called from
 * the Next.js API route. It uses dependency injection (TrinityDeps)
 * so the actual CDP/Farcaster/ERC-8004 implementations are pluggable.
 *
 * Saga Pattern:
 *   Step A: Provision CDP Wallet     → trinityStatus = CDP_ONLY
 *   Step B: Create Farcaster Account → trinityStatus = CDP_FARCASTER
 *   Step C: Mint ERC-8004 Identity   → trinityStatus = COMPLETE
 */

import type { PrismaClient, TrinityStatus } from '@prisma/client';
import type {
  TrinityDeployInput,
  TrinityDeployResult,
  TrinityDeps,
  CdpResult,
  FarcasterResult,
  Erc8004Result,
} from './trinity-deployer-types.js';

/** Default starting reputation for newly minted agents */
const DEFAULT_STARTING_SCORE = 500;

// ── Demo Mode Mocks ─────────────────────────────────────────────────────────

function mockCdpResult(agentId: string): CdpResult {
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

function mockErc8004Result(_agentId: string, agentUri: string): Erc8004Result {
  return {
    tokenId: Math.floor(Math.random() * 900_000) + 100_000,
    agentUri,
    mintTxHash: null,
  };
}

// ── Agent URI Builder ───────────────────────────────────────────────────────

export function buildAgentUri(
  agentId: string,
  walletAddress: string,
  fid: number,
  skills: string[],
): string {
  return JSON.stringify({
    version: '1.0',
    platform: 'ceos.run',
    agentId,
    walletAddress,
    fid,
    skills: skills.slice(0, 5),
    registeredAt: new Date().toISOString(),
  });
}

// ── The Trinity Deployer ────────────────────────────────────────────────────

export async function deployTrinity(
  prisma: PrismaClient,
  input: TrinityDeployInput,
  deps: TrinityDeps,
  demoMode: boolean,
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
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
      return { trinityStatus, cdp: null, farcaster: null, erc8004: null, errors };
    }
  } else if (currentAgent.walletId && currentAgent.walletAddress) {
    cdpResult = {
      walletId: currentAgent.walletId,
      walletAddress: currentAgent.walletAddress,
      walletEmail: '',
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

        const persona = (input.persona?.description as string) ?? '';

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
      return { trinityStatus, cdp: cdpResult, farcaster: null, erc8004: null, errors };
    }
  } else if (currentAgent.fid && currentAgent.signerUuid) {
    farcasterResult = {
      fid: currentAgent.fid,
      signerUuid: currentAgent.signerUuid,
      username: '',
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
        erc8004Result = mockErc8004Result(agentId, agentUri);
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
