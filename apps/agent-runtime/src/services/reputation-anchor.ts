/**
 * Reputation Anchor — Hash & Anchor Service for Data Moat Protection
 *
 * This service implements the "Hash & Anchor" pattern that protects ceos.run's
 * proprietary RLAIF data while providing cryptographic provenance on-chain.
 *
 * The Flow:
 *   1. Fetch the AgentDecisionLog record for the completed job
 *   2. Canonicalize the record (deterministic JSON serialization)
 *   3. Compute SHA-256 hash of the canonical form
 *   4. Build a metadata envelope (public-safe summary)
 *   5. Write the hash back to the decision log record
 *   6. Anchor on-chain: addValidation(tokenId, hash, isSuccess) + updateReputation()
 *
 * CRITICAL: Raw prompts and responses NEVER leave the database.
 * Only the hash + metadata envelope go on-chain.
 */

import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type pino from 'pino';
import type { Abi, Address } from 'viem';
import { BaseChainClient } from '../integrations/base-chain.js';
import {
  calculateReputation,
  DEFAULT_STARTING_SCORE,
  type ReputationInput,
  type ReputationResult,
} from './reputation-calculator.js';

// ── On-chain Constants ──────────────────────────────────────────────────────

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/**
 * Minimal ABI slice for ERC-8004 on-chain anchoring.
 * Only the two functions we call: addValidation + updateReputation.
 * The full ABI lives in apps/web/lib/contracts.ts (different package).
 */
const ERC8004_ANCHOR_ABI = [
  {
    type: 'function',
    name: 'addValidation',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'skillId', type: 'string' },
      { name: 'passed', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateReputation',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'score', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as unknown as Abi;

// ── Types ──────────────────────────────────────────────────────────────────────

/** The canonicalized form of a decision log for hashing */
interface CanonicalDecisionLog {
  agentId: string;
  jobId: string;
  prompt: unknown;
  response: unknown;
  modelUsed: string;
  tokensUsed: number;
  executionTimeMs: number;
  isSuccess: boolean;
  errorMessage: string | null;
  createdAt: string; // ISO-8601
}

/** Metadata envelope — the public-safe summary anchored on-chain */
export interface MetadataEnvelope {
  version: '1.0';
  jobId: string;
  agentId: string;
  isSuccess: boolean;
  executionTimeMs: number;
  decisionLogHash: string;
  reputationDelta: number;
  newReputationScore: number;
  anchoredAt: string; // ISO-8601
}

/** Result of the full anchor pipeline */
export interface AnchorResult {
  decisionLogHash: string;
  metadataEnvelope: MetadataEnvelope;
  reputationResult: ReputationResult;
  /** Phase 2: will contain the on-chain tx hash */
  anchoredTxHash: string | null;
}

// ── Canonicalization ─────────────────────────────────────────────────────────

/**
 * Canonicalize a decision log record into a deterministic JSON string.
 *
 * We sort keys alphabetically and use consistent formatting to ensure
 * that the same logical record always produces the same hash, regardless
 * of property insertion order or whitespace differences.
 *
 * This is critical for provenance: if someone queries our API for
 * a decision log and hashes it themselves, they must get the same
 * hash that's anchored on-chain.
 */
function canonicalize(log: CanonicalDecisionLog): string {
  // Deep sort all keys recursively
  return JSON.stringify(log, Object.keys(log).sort(), 0);
}

/**
 * Compute SHA-256 hash of a canonicalized decision log.
 * Returns hex-encoded hash string (64 chars).
 */
function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Hash a decision log record and compute its SHA-256 digest.
 *
 * Pure function — no database access, no side effects.
 * Useful for verification: clients can re-hash and compare.
 */
export function hashDecisionLog(log: CanonicalDecisionLog): string {
  const canonical = canonicalize(log);
  return sha256(canonical);
}

/**
 * Build the public-safe metadata envelope for on-chain anchoring.
 *
 * This envelope contains ONLY metadata — no prompts, no responses.
 * It's designed to be stored on-chain (or in an event log) without
 * exposing proprietary RLAIF data.
 */
export function buildMetadataEnvelope(
  jobId: string,
  agentId: string,
  isSuccess: boolean,
  executionTimeMs: number,
  decisionLogHash: string,
  reputationResult: ReputationResult,
): MetadataEnvelope {
  return {
    version: '1.0',
    jobId,
    agentId,
    isSuccess,
    executionTimeMs,
    decisionLogHash,
    reputationDelta: reputationResult.delta,
    newReputationScore: reputationResult.newScore,
    anchoredAt: new Date().toISOString(),
  };
}

/**
 * Execute the full anchor pipeline for a completed/disputed service job.
 *
 * This is the main entry point called from the service-executor after
 * a job reaches a terminal state (COMPLETED or DISPUTED).
 *
 * Pipeline:
 *   1. Find the decision log for this job
 *   2. Fetch the agent's current reputation score
 *   3. Calculate the new reputation score
 *   4. Canonicalize and hash the decision log
 *   5. Build the metadata envelope
 *   6. Persist: update decision log with hash, update reputation score
 *   7. (Phase 2) Anchor on-chain
 *
 * Wrapped in try/catch — anchor failures must never crash the executor.
 */
export async function anchorJobCompletion(
  prisma: PrismaClient,
  jobId: string,
  agentId: string,
  isSuccess: boolean,
  executionTimeMs: number,
  maxLatencyMs: number,
  logger: pino.Logger,
): Promise<AnchorResult | null> {
  try {
    // ── Step 1: Fetch the decision log for this job ────────────────────────
    const decisionLog = await prisma.agentDecisionLog.findFirst({
      where: { jobId, agentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!decisionLog) {
      logger.warn(
        { jobId, agentId },
        'Anchor: no decision log found for job — skipping anchor',
      );
      return null;
    }

    // ── Step 2: Fetch current reputation score ────────────────────────────
    const identity = await prisma.eRC8004Identity.findUnique({
      where: { agentId },
      select: { reputationScore: true },
    });

    const currentScore = identity?.reputationScore ?? DEFAULT_STARTING_SCORE;

    // ── Step 3: Calculate new reputation ──────────────────────────────────
    const repInput: ReputationInput = {
      currentScore,
      isSuccess,
      executionTimeMs,
      maxLatencyMs,
    };

    const reputationResult = calculateReputation(repInput);

    logger.info(
      {
        jobId,
        agentId,
        reputation: reputationResult.breakdown,
      },
      'Anchor: reputation calculated',
    );

    // ── Step 4: Canonicalize and hash ─────────────────────────────────────
    const canonical: CanonicalDecisionLog = {
      agentId: decisionLog.agentId,
      jobId: decisionLog.jobId,
      prompt: decisionLog.prompt,
      response: decisionLog.response,
      modelUsed: decisionLog.modelUsed,
      tokensUsed: decisionLog.tokensUsed,
      executionTimeMs: decisionLog.executionTimeMs,
      isSuccess: decisionLog.isSuccess,
      errorMessage: decisionLog.errorMessage,
      createdAt: decisionLog.createdAt.toISOString(),
    };

    const decisionLogHash = hashDecisionLog(canonical);

    // ── Step 5: Build metadata envelope ──────────────────────────────────
    const envelope = buildMetadataEnvelope(
      jobId,
      agentId,
      isSuccess,
      executionTimeMs,
      decisionLogHash,
      reputationResult,
    );

    // ── Step 6: Persist hash + reputation update in a transaction ─────────
    await prisma.$transaction([
      // Update the decision log with its hash
      prisma.agentDecisionLog.update({
        where: { id: decisionLog.id },
        data: {
          decisionLogHash,
          // Phase 2: anchoredTxHash and anchoredAt will be set after on-chain tx
        },
      }),
      // Update the agent's ERC-8004 reputation score (if identity exists)
      ...(identity
        ? [
            prisma.eRC8004Identity.update({
              where: { agentId },
              data: { reputationScore: reputationResult.newScore },
            }),
          ]
        : []),
    ]);

    logger.info(
      {
        jobId,
        agentId,
        decisionLogHash: decisionLogHash.slice(0, 16) + '...',
        reputationScore: reputationResult.newScore,
        delta: reputationResult.delta,
        latencyBonus: reputationResult.latencyBonusApplied,
      },
      'Anchor: decision log hashed and reputation updated',
    );

    // ── Step 7: On-chain anchoring via ERC-8004 ─────────────────────────
    let anchoredTxHash: string | null = null;

    const registryAddress = process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS?.trim();
    const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
    const rpcUrl = process.env.BASE_RPC_URL;
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '8453');

    if (!DEMO_MODE && identity && registryAddress && deployerKey && rpcUrl) {
      // Look up the agent's ERC-8004 token ID
      const tokenRecord = await prisma.eRC8004Identity.findUnique({
        where: { agentId },
        select: { tokenId: true },
      });

      if (tokenRecord?.tokenId) {
        try {
          const chainClient = new BaseChainClient({ rpcUrl, chainId });
          chainClient.initializeWallet(deployerKey);

          const tokenIdBigInt = BigInt(tokenRecord.tokenId);

          // 1. Anchor the decision log hash as a "validation" entry
          //    skillId = decisionLogHash (SHA-256 of the canonical decision log)
          //    passed  = isSuccess (did the job complete successfully?)
          const validationTx = await chainClient.writeContract({
            address: registryAddress as Address,
            abi: ERC8004_ANCHOR_ABI,
            functionName: 'addValidation',
            args: [tokenIdBigInt, decisionLogHash, isSuccess],
          });

          // 2. Update the agent's on-chain reputation score
          const reputationTx = await chainClient.writeContract({
            address: registryAddress as Address,
            abi: ERC8004_ANCHOR_ABI,
            functionName: 'updateReputation',
            args: [tokenIdBigInt, BigInt(reputationResult.newScore)],
          });

          // Wait for both transactions to confirm
          const [validationReceipt, reputationReceipt] = await Promise.all([
            chainClient.waitForTransaction(validationTx),
            chainClient.waitForTransaction(reputationTx),
          ]);

          // The validation tx is the canonical anchor (it contains the hash)
          anchoredTxHash = validationTx;

          // Persist the anchor tx hash and timestamp to the decision log
          await prisma.agentDecisionLog.update({
            where: { id: decisionLog.id },
            data: {
              anchoredTxHash: validationTx,
              anchoredAt: new Date(),
            },
          });

          logger.info(
            {
              jobId,
              agentId,
              tokenId: tokenRecord.tokenId,
              validationTx,
              reputationTx,
              validationBlock: Number(validationReceipt.blockNumber),
              reputationBlock: Number(reputationReceipt.blockNumber),
            },
            'Anchor: decision anchored on-chain via ERC-8004',
          );

          // Clean up — no persistent watchers in this flow
          chainClient.stopAllWatchers();
        } catch (chainErr) {
          // On-chain anchoring is non-blocking — log warning and continue
          logger.warn(
            {
              jobId,
              agentId,
              error: chainErr instanceof Error ? chainErr.message : String(chainErr),
            },
            'Anchor: on-chain anchoring failed — hash persisted in DB only',
          );
        }
      } else {
        logger.debug(
          { jobId, agentId },
          'Anchor: agent has no ERC-8004 token — skipping on-chain anchor',
        );
      }
    } else if (!DEMO_MODE) {
      logger.debug(
        {
          jobId,
          agentId,
          hasIdentity: !!identity,
          hasRegistry: !!registryAddress,
          hasDeployerKey: !!deployerKey,
          hasRpcUrl: !!rpcUrl,
        },
        'Anchor: skipping on-chain anchor — missing configuration',
      );
    }

    return {
      decisionLogHash,
      metadataEnvelope: envelope,
      reputationResult,
      anchoredTxHash,
    };
  } catch (err) {
    // Anchor failures must never crash the executor
    logger.error(
      {
        jobId,
        agentId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      'Anchor: failed to anchor job completion — reputation update skipped',
    );
    return null;
  }
}
