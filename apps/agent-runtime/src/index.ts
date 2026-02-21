import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { config, logger } from './config.js';
import { ContentPipeline } from './core/content-pipeline.js';
import { AgentScheduler } from './core/scheduler.js';
import { AgentEngine } from './core/agent-engine.js';
import { SkillExecutor, SkillType } from './core/skill-executor.js';
import { ToolRegistry } from './core/tool-registry.js';
import { registerDefaultTools } from './core/tool-implementations.js';
import { TreasuryLedger, type TreasuryDbAdapter } from './core/treasury-ledger.js';
import { TrendingStrategy } from './strategies/trending.js';
import { OpenRouterClient } from './integrations/openrouter.js';
import { FalAiClient } from './integrations/fal-ai.js';
import { NeynarClient } from './integrations/neynar.js';
import { BaseChainClient } from './integrations/base-chain.js';
import { createContentWorker } from '../workers/content-worker.js';
import { createMetricsWorker } from '../workers/metrics-worker.js';
import { createPostingWorker } from '../workers/posting-worker.js';
import { createSchedulerWorker } from '../workers/scheduler.js';
import { createScoutWorker } from '../workers/scout-worker.js';
import { createTreasuryWorker } from '../workers/treasury-worker.js';
import { createFeeDistributorWorker } from '../workers/fee-distributor.js';
import { createWalletProvisionerWorker, SCAN_INTERVAL_MS } from '../workers/wallet-provisioner.js';
import { createSocialProvisionerWorker, SCAN_INTERVAL_MS as SOCIAL_SCAN_INTERVAL_MS } from '../workers/social-provisioner.js';
import { getStrategy } from './strategies/posting.js';

const METRICS_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const AGENT_POLL_INTERVAL_MS = 60 * 1000; // Check for new agents every 60 seconds

interface RuntimeContext {
  redis: IORedis;
  engine: AgentEngine;
  scheduler: AgentScheduler;
  pipeline: ContentPipeline;
  skillExecutor: SkillExecutor;
  openrouter: OpenRouterClient;
  falAi: FalAiClient;
  neynar: NeynarClient;
  baseChain: BaseChainClient | null;
  metricsQueue: Queue;
}

let runtimeContext: RuntimeContext | null = null;
let isShuttingDown = false;
let agentPollTimer: NodeJS.Timeout | null = null;

/**
 * Load all ACTIVE agents from the database and schedule them.
 * Also polls periodically for newly deployed agents.
 */
async function loadAndScheduleAgents(
  prisma: PrismaClient,
  engine: AgentEngine,
): Promise<void> {
  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'ACTIVE' },
    });

    logger.info({ agentCount: agents.length }, 'Found active agents in database');

    const runningIds = new Set(engine.getRunningAgentIds());

    for (const agent of agents) {
      // Skip already running agents
      if (runningIds.has(agent.id)) {
        continue;
      }

      // Skip agents without a valid signer
      if (!agent.signerUuid || agent.signerUuid.startsWith('demo-signer-')) {
        logger.debug({ agentId: agent.id, name: agent.name }, 'Skipping agent without valid signer');
        continue;
      }

      const persona = typeof agent.persona === 'string'
        ? agent.persona
        : (agent.persona as Record<string, unknown>)?.description as string ?? '';

      const strategyJson = agent.strategy as Record<string, unknown>;
      const strategyName = (strategyJson?.name as string) ?? 'Balanced';

      try {
        const strategy = getStrategy(strategyName);

        await engine.startAgent({
          id: agent.id,
          name: agent.name,
          persona,
          signerUuid: agent.signerUuid,
          fid: agent.fid ?? 0,
          strategy,
        });

        logger.info(
          { agentId: agent.id, name: agent.name, strategy: strategyName },
          'Agent scheduled for autonomous posting',
        );
      } catch (error) {
        logger.error(
          { agentId: agent.id, error: error instanceof Error ? error.message : String(error) },
          'Failed to schedule agent',
        );
      }
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to load agents from database',
    );
  }
}

/**
 * Schedule repeatable metrics collection jobs for all active agents.
 * Each agent gets a unique repeatable job that runs every 30 minutes.
 */
async function scheduleMetricsJobs(
  prisma: PrismaClient,
  metricsQueue: Queue,
): Promise<void> {
  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fid: true, name: true },
    });

    for (const agent of agents) {
      if (!agent.fid) continue;

      await metricsQueue.add(
        'collect-metrics',
        { agentId: agent.id, fid: agent.fid },
        {
          jobId: `metrics-${agent.id}`,
          repeat: {
            every: METRICS_INTERVAL_MS,
          },
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      );
    }

    logger.info(
      { agentCount: agents.filter((a) => a.fid).length, intervalMs: METRICS_INTERVAL_MS },
      'Metrics collection jobs scheduled',
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to schedule metrics jobs',
    );
  }
}

async function bootstrap(): Promise<RuntimeContext> {
  logger.info({ env: config.NODE_ENV, chainId: config.NEXT_PUBLIC_CHAIN_ID }, 'Bootstrapping ceos.run Agent Runtime');

  // 1. Initialize Redis connection
  const redis = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  await redis.connect();
  logger.info('Redis connected');

  // 2. Initialize Prisma for agent discovery
  const prisma = new PrismaClient();
  logger.info('Database connected');

  // 3. Initialize integration clients
  const openrouter = new OpenRouterClient(config.OPENROUTER_API_KEY);
  const falAi = new FalAiClient(config.FAL_KEY);
  const neynar = new NeynarClient(config.NEYNAR_API_KEY);

  let baseChain: BaseChainClient | null = null;
  if (!DEMO_MODE && config.BASE_RPC_URL) {
    baseChain = new BaseChainClient({
      rpcUrl: config.BASE_RPC_URL,
      chainId: config.NEXT_PUBLIC_CHAIN_ID,
    });
    logger.info('BaseChainClient initialized');

    // Initialize wallet for on-chain writes (workers need this)
    if (config.DEPLOYER_PRIVATE_KEY) {
      baseChain.initializeWallet(config.DEPLOYER_PRIVATE_KEY);
      logger.info({ address: baseChain.getAccountAddress() }, 'Wallet initialized for on-chain writes');
    } else {
      logger.warn('DEPLOYER_PRIVATE_KEY not set — workers will skip on-chain writes');
    }
  } else {
    logger.info('DEMO MODE: Skipping BaseChainClient initialization');
  }

  logger.info({ demoMode: DEMO_MODE }, 'Integration clients initialized');

  // 4. Initialize core modules
  const pipeline = new ContentPipeline(openrouter, falAi);
  const scheduler = new AgentScheduler(redis);
  const engine = new AgentEngine(pipeline, scheduler);

  // 4a. Tool Registry + Treasury Ledger (for dynamic ReAct execution)
  const toolRegistry = new ToolRegistry();
  registerDefaultTools(toolRegistry);
  logger.info({ toolCount: toolRegistry.getToolCount() }, 'Tool registry initialized');

  // Prisma-backed treasury adapter
  //
  // Phase 1: Uses walletSessionLimit (Decimal 18,6) as the treasury balance
  // proxy, converted to micro-USDC (BigInt). This avoids a schema migration.
  //
  // TODO: PHASE 2 — Add dedicated `treasury_balance BigInt` column and
  // `AgentDecisionLog` table for full RLAIF audit trail.
  const treasuryDbAdapter: TreasuryDbAdapter = {
    async getBalance(agentId: string): Promise<bigint> {
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { walletSessionLimit: true },
      });
      // walletSessionLimit is Decimal(18,6), default 50 (= 50 USDC)
      // Convert to micro-USDC: multiply by 1_000_000
      const decimalValue = Number(agent?.walletSessionLimit ?? 50);
      return BigInt(Math.floor(decimalValue * 1_000_000));
    },
    async setBalance(agentId: string, balanceMicroUsdc: bigint): Promise<void> {
      // Convert micro-USDC back to Decimal for storage
      const decimalValue = Number(balanceMicroUsdc) / 1_000_000;
      await prisma.agent.update({
        where: { id: agentId },
        data: { walletSessionLimit: decimalValue },
      });
    },
    async recordDeduction(record): Promise<void> {
      // TODO: PHASE 2 — Write to AgentDecisionLog table for RLAIF
      logger.debug(
        {
          agentId: record.agentId,
          toolId: record.toolId,
          cost: record.costMicroUsdc.toString(),
        },
        'Treasury deduction recorded (in-memory only for Phase 1)',
      );
    },
  };

  const treasuryLedger = new TreasuryLedger(treasuryDbAdapter);
  const skillExecutor = new SkillExecutor(openrouter, toolRegistry, treasuryLedger);

  // Register built-in skills
  skillExecutor.registerSkill({
    id: 'content-generation',
    name: 'Content Generation',
    type: SkillType.CONTENT_GENERATION,
    timeoutMs: 30_000,
    execute: async (ctx) => {
      const agentName = (ctx.parameters['agentName'] as string) ?? 'Agent';
      const strategyName = (ctx.parameters['strategy'] as string) ?? 'Balanced';
      const strategy = getStrategy(strategyName);
      const result = await pipeline.generateContent(
        { agentId: ctx.agentId, persona: ctx.agentPersona, name: agentName },
        strategy,
      );
      return result;
    },
  });

  skillExecutor.registerSkill({
    id: 'trend-analysis',
    name: 'Trend Analysis',
    type: SkillType.ANALYTICS,
    timeoutMs: 30_000,
    execute: async () => {
      const trending = new TrendingStrategy(openrouter);
      const trends = await trending.detectTrends();
      return { trends: trends.slice(0, 5) };
    },
  });

  skillExecutor.registerSkill({
    id: 'engagement-analysis',
    name: 'Engagement Analysis',
    type: SkillType.ENGAGEMENT,
    timeoutMs: 15_000,
    execute: async (ctx) => {
      return {
        agentId: ctx.agentId,
        message: 'Engagement analysis skill executed',
        parameters: ctx.parameters,
      };
    },
  });

  logger.info(
    { skillCount: skillExecutor.getRegisteredSkills().length },
    'Core modules initialized with built-in skills',
  );

  // 5. Initialize BullMQ workers
  const contentWorker = createContentWorker(redis, config.OPENROUTER_API_KEY, config.FAL_KEY);
  const metricsWorker = createMetricsWorker(redis);
  const postingWorker = createPostingWorker(redis, config.NEYNAR_API_KEY);
  const { worker: schedulerWorker, getHealth, shutdown: shutdownScheduler } = createSchedulerWorker(redis);

  // 5b. Initialize financial workers (ScoutWorker, TreasuryWorker, FeeDistributor)
  let scoutWorker: ReturnType<typeof createScoutWorker> | null = null;
  let treasuryWorker: ReturnType<typeof createTreasuryWorker> | null = null;
  let feeDistributorWorker: ReturnType<typeof createFeeDistributorWorker> | null = null;
  let scoutQueue: Queue | null = null;
  let treasuryQueue: Queue | null = null;
  let feeDistQueue: Queue | null = null;

  if (baseChain) {
    scoutWorker = createScoutWorker(redis, baseChain);
    treasuryWorker = createTreasuryWorker(redis, baseChain);
    feeDistributorWorker = createFeeDistributorWorker(redis, baseChain);

    // Create cron queues with repeatable jobs
    scoutQueue = new Queue('scout-investment', { connection: redis });
    treasuryQueue = new Queue('treasury-management', { connection: redis });
    feeDistQueue = new Queue('fee-distribution', { connection: redis });

    // Scout: every 10 minutes
    await scoutQueue.add('scout-tick', { triggeredAt: new Date().toISOString() }, {
      jobId: 'scout-repeatable',
      repeat: { every: 10 * 60 * 1000 },
      removeOnComplete: 50,
      removeOnFail: 25,
    });

    // Treasury: every 5 minutes
    await treasuryQueue.add('treasury-tick', { triggeredAt: new Date().toISOString() }, {
      jobId: 'treasury-repeatable',
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    // Fee distribution: every 24 hours
    await feeDistQueue.add('fee-dist-tick', { triggeredAt: new Date().toISOString() }, {
      jobId: 'fee-dist-repeatable',
      repeat: { every: 24 * 60 * 60 * 1000 },
      removeOnComplete: 50,
      removeOnFail: 25,
    });

    logger.info('Financial workers + cron queues initialized (scout: 10m, treasury: 5m, fee-dist: 24h)');
  } else {
    logger.info('Skipping financial workers — BaseChainClient not available');
  }

  logger.info('BullMQ workers initialized');

  // 5c. Initialize Wallet Provisioner (background CDP wallet creation)
  const walletProvisioner = createWalletProvisionerWorker(redis);

  // Run initial scan for any DEPLOYING agents left from previous runs
  await walletProvisioner.scanAndEnqueue();

  // Start periodic scanner: check for DEPLOYING agents every 2 minutes
  let walletScanTimer: NodeJS.Timeout | null = null;
  walletScanTimer = setInterval(() => {
    if (!isShuttingDown) {
      void walletProvisioner.scanAndEnqueue();
    }
  }, SCAN_INTERVAL_MS);

  logger.info(
    { scanIntervalMs: SCAN_INTERVAL_MS },
    'Wallet provisioner initialized — scanning for DEPLOYING agents',
  );

  // 5d. Initialize Social Provisioner (Farcaster identity + Genesis cast)
  const socialProvisioner = createSocialProvisionerWorker(redis, config);

  // Run initial scan for agents with wallet but no social identity
  await socialProvisioner.scanAndEnqueue();

  // Start periodic scanner: check for socially-unprovisioned agents every 2 minutes
  let socialScanTimer: NodeJS.Timeout | null = null;
  socialScanTimer = setInterval(() => {
    if (!isShuttingDown) {
      void socialProvisioner.scanAndEnqueue();
    }
  }, SOCIAL_SCAN_INTERVAL_MS);

  logger.info(
    { scanIntervalMs: SOCIAL_SCAN_INTERVAL_MS },
    'Social provisioner initialized — scanning for agents awaiting identity',
  );

  // 5e. Initialize metrics scheduling queue
  const metricsQueue = new Queue('agent-metrics', { connection: redis });
  logger.info('Metrics scheduling queue initialized');

  // 6. Load ACTIVE agents from database and schedule them
  await loadAndScheduleAgents(prisma, engine);

  // 6b. Schedule repeatable metrics collection jobs
  await scheduleMetricsJobs(prisma, metricsQueue);

  // 7. Start polling for new agents (detects newly deployed agents)
  agentPollTimer = setInterval(() => {
    if (!isShuttingDown) {
      void loadAndScheduleAgents(prisma, engine);
    }
  }, AGENT_POLL_INTERVAL_MS);

  logger.info(
    { pollIntervalMs: AGENT_POLL_INTERVAL_MS },
    'Agent discovery polling started',
  );

  // 8. Register graceful shutdown
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress, forcing exit');
      process.exit(1);
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

    // Stop polling
    if (agentPollTimer) {
      clearInterval(agentPollTimer);
      agentPollTimer = null;
    }
    if (walletScanTimer) {
      clearInterval(walletScanTimer);
      walletScanTimer = null;
    }
    if (socialScanTimer) {
      clearInterval(socialScanTimer);
      socialScanTimer = null;
    }

    const shutdownTimeout = setTimeout(() => {
      logger.error('Shutdown timed out after 30s, forcing exit');
      process.exit(1);
    }, 30_000);

    try {
      // Stop engine first (stops scheduling new jobs)
      await engine.shutdown();
      logger.info('Engine shutdown complete');

      // Stop workers
      const workerClosePromises = [
        contentWorker.close(),
        metricsWorker.close(),
        postingWorker.close(),
        shutdownScheduler(),
      ];
      workerClosePromises.push(walletProvisioner.shutdown());
      workerClosePromises.push(socialProvisioner.shutdown());
      if (scoutWorker) workerClosePromises.push(scoutWorker.close());
      if (treasuryWorker) workerClosePromises.push(treasuryWorker.close());
      if (feeDistributorWorker) workerClosePromises.push(feeDistributorWorker.close());
      await Promise.allSettled(workerClosePromises);
      logger.info('Workers shutdown complete');

      // Close queues
      const queueClosePromises = [metricsQueue.close()];
      if (scoutQueue) queueClosePromises.push(scoutQueue.close());
      if (treasuryQueue) queueClosePromises.push(treasuryQueue.close());
      if (feeDistQueue) queueClosePromises.push(feeDistQueue.close());
      await Promise.allSettled(queueClosePromises);
      logger.info('Queues closed');

      // Stop scheduler queues
      await scheduler.shutdown();
      logger.info('Scheduler shutdown complete');

      // Stop Neynar polling
      neynar.stopAllPolling();

      // Stop chain watchers (skip in demo mode)
      if (baseChain) {
        baseChain.stopAllWatchers();
      }

      // Close database connection
      await prisma.$disconnect();
      logger.info('Database connection closed');

      // Close Redis last
      await redis.quit();
      logger.info('Redis connection closed');

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error during shutdown',
      );
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason) }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });

  const context: RuntimeContext = {
    redis,
    engine,
    scheduler,
    pipeline,
    skillExecutor,
    openrouter,
    falAi,
    neynar,
    baseChain,
    metricsQueue,
  };

  runtimeContext = context;

  const runningAgents = engine.getRunningAgentIds();
  const activeWorkers = ['content', 'metrics', 'posting', 'scheduler', 'wallet-provisioner', 'social-provisioner'];
  if (scoutWorker) activeWorkers.push('scout', 'treasury', 'fee-distributor');
  logger.info({
    workers: activeWorkers,
    integrations: ['openrouter', 'fal-ai', 'neynar', 'base-chain'],
    activeAgents: runningAgents.length,
    agentIds: runningAgents,
    walletInitialized: baseChain?.isWalletInitialized() ?? false,
  }, 'ceos.run Agent Runtime started — autonomous mode active');

  return context;
}

// Entry point when run directly
async function main(): Promise<void> {
  try {
    await bootstrap();
  } catch (error) {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to start Agent Runtime',
    );
    process.exit(1);
  }
}

void main();

export {
  bootstrap,
  AgentEngine,
  ContentPipeline,
  AgentScheduler,
  SkillExecutor,
  OpenRouterClient,
  FalAiClient,
  NeynarClient,
  BaseChainClient,
};

export type { RuntimeContext };
