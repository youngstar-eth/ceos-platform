import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { type Address, formatEther, parseEther } from 'viem';
import pino from 'pino';
import { logger as rootLogger, config } from '../src/config.js';
import { BaseChainClient } from '../src/integrations/base-chain.js';
import { FEE_SPLITTER_ABI } from '../src/abis/fee-splitter.js';

const prisma = new PrismaClient();

// ── Types ─────────────────────────────────────────────

interface FeeDistributorJobData {
  triggeredAt: string;
}

interface FeeDistributorJobResult {
  distributionsMade: number;
  claimsMade: number;
  totalDistributed: string;
  skippedReason?: string;
}

// ── Constants ─────────────────────────────────────────

const QUEUE_NAME = 'fee-distribution';

/// Minimum FeeSplitter balance to trigger distribution (0.1 ETH)
const MIN_DISTRIBUTION_BALANCE = parseEther('0.1');

// ── Worker Factory ────────────────────────────────────

export function createFeeDistributorWorker(
  connection: Redis,
  baseChain: BaseChainClient,
): Worker<FeeDistributorJobData, FeeDistributorJobResult> {
  const logger: pino.Logger = rootLogger.child({ module: 'FeeDistributor' });

  const feeSplitterAddress = config.NEXT_PUBLIC_FEE_SPLITTER_ADDRESS as Address | undefined;
  const scoutFundAddress = config.NEXT_PUBLIC_SCOUT_FUND_ADDRESS as Address | undefined;

  const worker = new Worker<FeeDistributorJobData, FeeDistributorJobResult>(
    QUEUE_NAME,
    async (job: Job<FeeDistributorJobData>): Promise<FeeDistributorJobResult> => {
      logger.info({ jobId: job.id }, 'Fee distributor tick — checking for distributable fees');

      // ── Pre-flight checks ───────────────────────────

      if (!feeSplitterAddress) {
        logger.warn('NEXT_PUBLIC_FEE_SPLITTER_ADDRESS not configured — skipping');
        return { distributionsMade: 0, claimsMade: 0, totalDistributed: '0', skippedReason: 'no_fee_splitter_address' };
      }

      if (!baseChain.isWalletInitialized()) {
        logger.warn('Wallet not initialized — skipping fee distribution');
        return { distributionsMade: 0, claimsMade: 0, totalDistributed: '0', skippedReason: 'wallet_not_initialized' };
      }

      await job.updateProgress(10);

      // ── Step 1: Check claimable balances ────────────

      // Check if ScoutFund has claimable balance (indicates prior distribution)
      let scoutClaimable = 0n;
      let protocolClaimable = 0n;

      if (scoutFundAddress) {
        try {
          const [ethAmount] = await baseChain.readContract<[bigint, bigint]>({
            address: feeSplitterAddress,
            abi: FEE_SPLITTER_ABI,
            functionName: 'getClaimable',
            args: [scoutFundAddress],
          });
          scoutClaimable = ethAmount;
        } catch (err) {
          logger.warn(
            { error: err instanceof Error ? err.message : String(err) },
            'Failed to read ScoutFund claimable',
          );
        }
      }

      // Check distribution count for logging
      const distCount = await baseChain.readContract<bigint>({
        address: feeSplitterAddress,
        abi: FEE_SPLITTER_ABI,
        functionName: 'getDistributionCount',
      });

      logger.info(
        {
          distributionCount: distCount.toString(),
          scoutClaimable: formatEther(scoutClaimable),
        },
        'FeeSplitter state',
      );

      await job.updateProgress(30);

      // ── Step 2: Execute pending claims ──────────────

      let claimsMade = 0;

      // Claim for ScoutFund if there are pending ETH
      if (scoutFundAddress && scoutClaimable > 0n) {
        try {
          // ScoutFund calls claimETH from its own address, but we can trigger
          // claimFundingETH on the ScoutFund contract which internally calls FeeSplitter.claimETH()
          // For now, we'll log that claims are pending — the ScoutWorker handles its own claims
          logger.info(
            { scoutClaimable: formatEther(scoutClaimable) },
            'ScoutFund has pending ETH claim',
          );
        } catch (err) {
          logger.warn(
            { error: err instanceof Error ? err.message : String(err) },
            'Failed to process ScoutFund claim',
          );
        }
      }

      // Check and process the deployer wallet's own claimable (for protocol treasury)
      const deployerAddress = baseChain.getAccountAddress();
      if (deployerAddress) {
        try {
          const [ethAmount] = await baseChain.readContract<[bigint, bigint]>({
            address: feeSplitterAddress,
            abi: FEE_SPLITTER_ABI,
            functionName: 'getClaimable',
            args: [deployerAddress],
          });
          protocolClaimable = ethAmount;

          if (protocolClaimable > 0n) {
            logger.info(
              { protocolClaimable: formatEther(protocolClaimable) },
              'Protocol treasury has pending ETH claim — executing claimETH',
            );

            const txHash = await baseChain.writeContract({
              address: feeSplitterAddress,
              abi: FEE_SPLITTER_ABI,
              functionName: 'claimETH',
            });

            const receipt = await baseChain.waitForTransaction(txHash);
            if (receipt.status === 'success') {
              claimsMade++;
              logger.info({ txHash, amount: formatEther(protocolClaimable) }, 'Protocol treasury ETH claimed');
            }
          }
        } catch (err) {
          logger.warn(
            { error: err instanceof Error ? err.message : String(err) },
            'Failed to claim protocol treasury ETH',
          );
        }
      }

      await job.updateProgress(60);

      // ── Step 3: Find agents needing fee distribution ─

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
        take: 100,
      });

      logger.info({ agentCount: agents.length }, 'Found agents for fee distribution check');

      // Note: FeeSplitter.distributeFees() is called by protocol revenue sources
      // (e.g., agent deployment fees, x402 payments). This worker's main role is to:
      // 1. Monitor the state of fee distributions
      // 2. Trigger claims for protocol treasury
      // 3. Log distribution metrics

      let distributionsMade = 0;
      let totalDistributed = 0n;

      // Check each agent's treasury for claimable growth capital
      for (const agent of agents) {
        const treasuryAddress = agent.onChainAddress as Address;

        try {
          const [ethClaimable] = await baseChain.readContract<[bigint, bigint]>({
            address: feeSplitterAddress,
            abi: FEE_SPLITTER_ABI,
            functionName: 'getClaimable',
            args: [treasuryAddress],
          });

          if (ethClaimable > 0n) {
            distributionsMade++;
            totalDistributed += ethClaimable;

            logger.info(
              {
                agentId: agent.id,
                treasury: treasuryAddress,
                claimable: formatEther(ethClaimable),
              },
              'Agent treasury has pending growth capital',
            );
          }
        } catch {
          // Skip — treasury may not be registered with FeeSplitter
        }
      }

      // Record distribution run
      if (distributionsMade > 0 || claimsMade > 0) {
        await prisma.feeDistribution.create({
          data: {
            totalAmount: totalDistributed.toString(),
            currency: 'ETH',
            agentTreasuryAddr: 'protocol-sweep',
            status: 'confirmed',
          },
        });
      }

      await job.updateProgress(100);

      logger.info(
        {
          distributionsMade,
          claimsMade,
          totalDistributed: formatEther(totalDistributed),
        },
        'Fee distributor tick complete',
      );

      return {
        distributionsMade,
        claimsMade,
        totalDistributed: formatEther(totalDistributed),
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
    logger.info(
      { jobId: job.id, result: job.returnvalue },
      'Fee distribution job completed',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      'Fee distribution job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Fee distributor worker error');
  });

  logger.info({ queue: QUEUE_NAME }, 'Fee distributor worker initialized');

  return worker;
}

export type { FeeDistributorJobData, FeeDistributorJobResult };
