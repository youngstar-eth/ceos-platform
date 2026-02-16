import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { type Address, parseEther, formatEther } from 'viem';
import pino from 'pino';
import { logger as rootLogger, config } from '../src/config.js';
import { BaseChainClient } from '../src/integrations/base-chain.js';
import { SCOUT_FUND_ABI } from '../src/abis/scout-fund.js';

const prisma = new PrismaClient();

// ── Types ─────────────────────────────────────────────

interface ScoutJobData {
  triggeredAt: string;
}

interface ScoutJobResult {
  investmentsMade: number;
  totalInvested: string;
  skippedReason?: string;
}

// ── Constants ─────────────────────────────────────────

const QUEUE_NAME = 'scout-investment';

/// Minimum fund balance to consider investing (0.01 ETH)
const MIN_FUND_BALANCE = parseEther('0.01');

/// Maximum investment per single transaction (0.5 ETH)
const MAX_SINGLE_INVESTMENT = parseEther('0.5');

/// Percentage of fund balance to invest per candidate (20%)
const INVESTMENT_RATIO = 20n;

/// Minimum CEOS score to qualify as investment candidate
const MIN_SCORE_THRESHOLD = 80;

/// Uniswap V3 default fee tier (0.3%)
const DEFAULT_FEE_TIER = 3000;

/// WETH address on Base (used as inputToken for ETH investments)
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address;

// ── Worker Factory ────────────────────────────────────

export function createScoutWorker(
  connection: Redis,
  baseChain: BaseChainClient,
): Worker<ScoutJobData, ScoutJobResult> {
  const logger: pino.Logger = rootLogger.child({ module: 'ScoutWorker' });

  const scoutFundAddress = config.NEXT_PUBLIC_SCOUT_FUND_ADDRESS as Address | undefined;

  const worker = new Worker<ScoutJobData, ScoutJobResult>(
    QUEUE_NAME,
    async (job: Job<ScoutJobData>): Promise<ScoutJobResult> => {
      logger.info({ jobId: job.id }, 'Scout worker tick — evaluating investment candidates');

      // ── Pre-flight checks ───────────────────────────

      if (!scoutFundAddress) {
        logger.warn('NEXT_PUBLIC_SCOUT_FUND_ADDRESS not configured — skipping');
        return { investmentsMade: 0, totalInvested: '0', skippedReason: 'no_scout_fund_address' };
      }

      if (!baseChain.isWalletInitialized()) {
        logger.warn('Wallet not initialized — skipping on-chain writes');
        return { investmentsMade: 0, totalInvested: '0', skippedReason: 'wallet_not_initialized' };
      }

      await job.updateProgress(10);

      // ── Step 1: Check fund balance ──────────────────

      const fundBalance = await baseChain.readContract<bigint>({
        address: scoutFundAddress,
        abi: SCOUT_FUND_ABI,
        functionName: 'getETHBalance',
      });

      logger.info({ fundBalance: formatEther(fundBalance) }, 'ScoutFund ETH balance');

      if (fundBalance < MIN_FUND_BALANCE) {
        logger.info('Fund balance below minimum — skipping investment round');
        return { investmentsMade: 0, totalInvested: '0', skippedReason: 'insufficient_balance' };
      }

      await job.updateProgress(30);

      // ── Step 2: Find investment candidates ──────────

      const candidates = await prisma.agent.findMany({
        where: {
          status: 'ACTIVE',
          onChainAddress: { not: null },
          ceosScores: {
            some: {
              totalScore: { gte: MIN_SCORE_THRESHOLD },
            },
          },
        },
        include: {
          ceosScores: {
            orderBy: { epoch: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      logger.info(
        { candidateCount: candidates.length },
        'Found investment candidates',
      );

      if (candidates.length === 0) {
        return { investmentsMade: 0, totalInvested: '0', skippedReason: 'no_candidates' };
      }

      await job.updateProgress(50);

      // ── Step 3: Evaluate and invest ─────────────────

      let investmentsMade = 0;
      let totalInvested = 0n;
      let remainingBalance = fundBalance;

      for (const candidate of candidates) {
        if (remainingBalance < MIN_FUND_BALANCE) {
          logger.info('Fund depleted below minimum — stopping investment round');
          break;
        }

        const agentToken = candidate.onChainAddress as Address;

        // Check if token is on the scoutable whitelist
        try {
          const isScoutable = await baseChain.readContract<boolean>({
            address: scoutFundAddress,
            abi: SCOUT_FUND_ABI,
            functionName: 'isScoutable',
            args: [agentToken],
          });

          if (!isScoutable) {
            logger.debug({ agentId: candidate.id, agentToken }, 'Token not scoutable — skipping');
            continue;
          }
        } catch (err) {
          logger.warn(
            { agentId: candidate.id, error: err instanceof Error ? err.message : String(err) },
            'Failed to check scoutable status',
          );
          continue;
        }

        // Check existing position
        try {
          const position = await baseChain.readContract<{
            token: Address;
            totalInvested: bigint;
            totalTokensAcquired: bigint;
            totalDivested: bigint;
            investmentCount: bigint;
            firstInvestedAt: bigint;
            lastInvestedAt: bigint;
          }>({
            address: scoutFundAddress,
            abi: SCOUT_FUND_ABI,
            functionName: 'getPosition',
            args: [agentToken],
          });

          // Skip if we've already invested 5+ times in this token
          if (position.investmentCount >= 5n) {
            logger.debug(
              { agentId: candidate.id, investmentCount: position.investmentCount.toString() },
              'Max investment count reached — skipping',
            );
            continue;
          }
        } catch {
          // No position yet — proceed
        }

        // Calculate investment amount: min(20% of remaining, MAX_SINGLE_INVESTMENT)
        const investAmount = remainingBalance * INVESTMENT_RATIO / 100n;
        const cappedAmount = investAmount > MAX_SINGLE_INVESTMENT ? MAX_SINGLE_INVESTMENT : investAmount;

        // Execute investment
        try {
          logger.info(
            { agentId: candidate.id, agentToken, amount: formatEther(cappedAmount) },
            'Executing ScoutFund.invest()',
          );

          const txHash = await baseChain.writeContract({
            address: scoutFundAddress,
            abi: SCOUT_FUND_ABI,
            functionName: 'invest',
            args: [agentToken, WETH_ADDRESS, cappedAmount, DEFAULT_FEE_TIER, 0n],
          });

          // Record in database
          await prisma.scoutInvestment.create({
            data: {
              agentId: candidate.id,
              agentToken,
              inputToken: WETH_ADDRESS,
              amountIn: cappedAmount.toString(),
              amountOut: '0', // Updated when tx confirms
              txHash,
              status: 'pending',
            },
          });

          // Wait for confirmation
          const receipt = await baseChain.waitForTransaction(txHash);

          await prisma.scoutInvestment.update({
            where: { txHash },
            data: { status: receipt.status === 'success' ? 'confirmed' : 'failed' },
          });

          if (receipt.status === 'success') {
            investmentsMade++;
            totalInvested += cappedAmount;
            remainingBalance -= cappedAmount;

            logger.info(
              {
                agentId: candidate.id,
                agentToken,
                amount: formatEther(cappedAmount),
                txHash,
                blockNumber: receipt.blockNumber.toString(),
              },
              'Investment confirmed',
            );
          } else {
            logger.warn({ agentId: candidate.id, txHash }, 'Investment transaction reverted');
          }
        } catch (err) {
          logger.error(
            {
              agentId: candidate.id,
              agentToken,
              error: err instanceof Error ? err.message : String(err),
            },
            'Investment failed',
          );
        }
      }

      await job.updateProgress(100);

      logger.info(
        { investmentsMade, totalInvested: formatEther(totalInvested) },
        'Scout worker tick complete',
      );

      return {
        investmentsMade,
        totalInvested: formatEther(totalInvested),
      };
    },
    {
      connection: connection.duplicate(),
      concurrency: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  );

  // ── Event Handlers ──────────────────────────────────

  worker.on('completed', (job) => {
    const result = job.returnvalue;
    logger.info(
      { jobId: job.id, investmentsMade: result.investmentsMade },
      'Scout job completed',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      'Scout job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Scout worker error');
  });

  logger.info({ queue: QUEUE_NAME }, 'Scout worker initialized');

  return worker;
}

export type { ScoutJobData, ScoutJobResult };
