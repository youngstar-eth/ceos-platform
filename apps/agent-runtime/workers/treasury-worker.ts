import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { type Address, formatEther, parseEther } from 'viem';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';
import { BaseChainClient } from '../src/integrations/base-chain.js';
import { AGENT_TREASURY_ABI } from '../src/abis/agent-treasury.js';

const prisma = new PrismaClient();

// ── Types ─────────────────────────────────────────────

interface TreasuryJobData {
  triggeredAt: string;
}

interface TreasuryJobResult {
  agentsProcessed: number;
  swapsExecuted: number;
  claimsExecuted: number;
}

// ── Constants ─────────────────────────────────────────

const QUEUE_NAME = 'treasury-management';

/// Minimum ETH balance in an agent treasury to trigger a claim from FeeSplitter
const CLAIM_TRIGGER_BALANCE = parseEther('0.01');

/// Minimum ETH balance to trigger take-profit swap (1 ETH)
const TAKE_PROFIT_THRESHOLD = parseEther('1');

/// Default swap deadline offset (30 minutes from now)
const SWAP_DEADLINE_OFFSET = 30 * 60;

/// WETH address on Base
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address;

/// USDC address on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

/// Default Uniswap V3 fee tier (0.3%)
const DEFAULT_FEE_TIER = 3000;

// ── Worker Factory ────────────────────────────────────

export function createTreasuryWorker(
  connection: Redis,
  baseChain: BaseChainClient,
): Worker<TreasuryJobData, TreasuryJobResult> {
  const logger: pino.Logger = rootLogger.child({ module: 'TreasuryWorker' });

  const worker = new Worker<TreasuryJobData, TreasuryJobResult>(
    QUEUE_NAME,
    async (job: Job<TreasuryJobData>): Promise<TreasuryJobResult> => {
      logger.info({ jobId: job.id }, 'Treasury worker tick — managing agent treasuries');

      if (!baseChain.isWalletInitialized()) {
        logger.warn('Wallet not initialized — skipping treasury management');
        return { agentsProcessed: 0, swapsExecuted: 0, claimsExecuted: 0 };
      }

      await job.updateProgress(10);

      // ── Step 1: Get agents with on-chain treasuries ─

      const agents = await prisma.agent.findMany({
        where: {
          status: 'ACTIVE',
          onChainAddress: { not: null },
        },
        select: {
          id: true,
          name: true,
          onChainAddress: true,
        },
        take: 50,
      });

      logger.info({ agentCount: agents.length }, 'Found agents with treasuries');

      if (agents.length === 0) {
        return { agentsProcessed: 0, swapsExecuted: 0, claimsExecuted: 0 };
      }

      await job.updateProgress(30);

      // ── Step 2: Process each treasury ───────────────

      let agentsProcessed = 0;
      let swapsExecuted = 0;
      let claimsExecuted = 0;

      for (const agent of agents) {
        const treasuryAddress = agent.onChainAddress as Address;

        try {
          // Read ETH balance
          const ethBalance = await baseChain.readContract<bigint>({
            address: treasuryAddress,
            abi: AGENT_TREASURY_ABI,
            functionName: 'getETHBalance',
          });

          // Read tracked token balances
          const trackedBalances = await baseChain.readContract<
            readonly { token: Address; balance: bigint }[]
          >({
            address: treasuryAddress,
            abi: AGENT_TREASURY_ABI,
            functionName: 'getTrackedBalances',
          });

          logger.debug(
            {
              agentId: agent.id,
              ethBalance: formatEther(ethBalance),
              trackedTokens: trackedBalances.length,
            },
            'Treasury snapshot',
          );

          agentsProcessed++;

          // ── Claim growth capital if available ─────

          if (ethBalance < CLAIM_TRIGGER_BALANCE) {
            try {
              await baseChain.writeContract({
                address: treasuryAddress,
                abi: AGENT_TREASURY_ABI,
                functionName: 'claimGrowthETH',
              });
              claimsExecuted++;
              logger.info({ agentId: agent.id }, 'Claimed growth ETH from FeeSplitter');
            } catch {
              // NothingToClaim or other error — expected if no fees allocated
              logger.debug({ agentId: agent.id }, 'No growth ETH to claim');
            }
          }

          // ── Take-profit swap if balance exceeds threshold ─

          if (ethBalance > TAKE_PROFIT_THRESHOLD) {
            const swapAmount = ethBalance / 2n; // Swap 50% of excess to USDC
            const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_OFFSET);

            try {
              logger.info(
                {
                  agentId: agent.id,
                  swapAmount: formatEther(swapAmount),
                  direction: 'WETH→USDC',
                },
                'Executing take-profit swap',
              );

              const txHash = await baseChain.writeContract({
                address: treasuryAddress,
                abi: AGENT_TREASURY_ABI,
                functionName: 'executeSwap',
                args: [{
                  tokenIn: WETH_ADDRESS,
                  tokenOut: USDC_ADDRESS,
                  fee: DEFAULT_FEE_TIER,
                  amountIn: swapAmount,
                  amountOutMinimum: 0n, // TODO: Add proper slippage protection via oracle
                  deadline,
                }],
              });

              const receipt = await baseChain.waitForTransaction(txHash);
              if (receipt.status === 'success') {
                swapsExecuted++;
                logger.info(
                  { agentId: agent.id, txHash, amount: formatEther(swapAmount) },
                  'Take-profit swap confirmed',
                );
              }
            } catch (err) {
              logger.error(
                {
                  agentId: agent.id,
                  error: err instanceof Error ? err.message : String(err),
                },
                'Take-profit swap failed',
              );
            }
          }
        } catch (err) {
          logger.error(
            {
              agentId: agent.id,
              treasury: treasuryAddress,
              error: err instanceof Error ? err.message : String(err),
            },
            'Failed to process treasury',
          );
        }
      }

      await job.updateProgress(100);

      logger.info(
        { agentsProcessed, swapsExecuted, claimsExecuted },
        'Treasury worker tick complete',
      );

      return { agentsProcessed, swapsExecuted, claimsExecuted };
    },
    {
      connection: connection.duplicate(),
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  // ── Event Handlers ──────────────────────────────────

  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, result: job.returnvalue },
      'Treasury job completed',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      'Treasury job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Treasury worker error');
  });

  logger.info({ queue: QUEUE_NAME }, 'Treasury worker initialized');

  return worker;
}

export type { TreasuryJobData, TreasuryJobResult };
