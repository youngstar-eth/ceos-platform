import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { config, logger } from './config.js';
import { ContentPipeline } from './core/content-pipeline.js';
import { AgentScheduler } from './core/scheduler.js';
import { AgentEngine } from './core/agent-engine.js';
import { SkillExecutor, SkillType } from './core/skill-executor.js';
import { TrendingStrategy } from './strategies/trending.js';
import { OpenRouterClient } from './integrations/openrouter.js';
import { FalAiClient } from './integrations/fal-ai.js';
import { NeynarClient } from './integrations/neynar.js';
import { BaseChainClient } from './integrations/base-chain.js';
import { createContentWorker } from '../workers/content-worker.js';
import { createMetricsWorker } from '../workers/metrics-worker.js';
import { createPostingWorker } from '../workers/posting-worker.js';
import { createSchedulerWorker } from '../workers/scheduler.js';
import { getStrategy } from './strategies/posting.js';

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

async function bootstrap(): Promise<RuntimeContext> {
  logger.info({ env: config.NODE_ENV, chainId: config.NEXT_PUBLIC_CHAIN_ID }, 'Bootstrapping OpenClaw Agent Runtime');

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
  } else {
    logger.info('DEMO MODE: Skipping BaseChainClient initialization');
  }

  logger.info({ demoMode: DEMO_MODE }, 'Integration clients initialized');

  // 4. Initialize core modules
  const pipeline = new ContentPipeline(openrouter, falAi);
  const scheduler = new AgentScheduler(redis);
  const engine = new AgentEngine(pipeline, scheduler);
  const skillExecutor = new SkillExecutor();

  // Register built-in skills
  skillExecutor.registerSkill({
    id: 'content-generation',
    name: 'Content Generation',
    type: SkillType.CONTENT_GENERATION,
    timeoutMs: 30_000,
    execute: async (ctx) => {
      const topic = (ctx.parameters['topic'] as string) ?? '';
      const result = await pipeline.generateContent('original', topic, {
        agentId: ctx.agentId,
        persona: ctx.agentPersona,
      });
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

  logger.info('BullMQ workers initialized');

  // 6. Load ACTIVE agents from database and schedule them
  await loadAndScheduleAgents(prisma, engine);

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

    const shutdownTimeout = setTimeout(() => {
      logger.error('Shutdown timed out after 30s, forcing exit');
      process.exit(1);
    }, 30_000);

    try {
      // Stop engine first (stops scheduling new jobs)
      await engine.shutdown();
      logger.info('Engine shutdown complete');

      // Stop workers
      await Promise.allSettled([
        contentWorker.close(),
        metricsWorker.close(),
        postingWorker.close(),
        shutdownScheduler(),
      ]);
      logger.info('Workers shutdown complete');

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
  };

  runtimeContext = context;

  const runningAgents = engine.getRunningAgentIds();
  logger.info({
    workers: ['content', 'metrics', 'posting', 'scheduler'],
    integrations: ['openrouter', 'fal-ai', 'neynar', 'base-chain'],
    activeAgents: runningAgents.length,
    agentIds: runningAgents,
  }, 'OpenClaw Agent Runtime started — autonomous mode active');

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
