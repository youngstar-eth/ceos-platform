import IORedis from 'ioredis';
import { config, logger } from './config.js';
import { ContentPipeline } from './core/content-pipeline.js';
import { AgentScheduler } from './core/scheduler.js';
import { AgentEngine } from './core/agent-engine.js';
import { SkillExecutor } from './core/skill-executor.js';
import { OpenRouterClient } from './integrations/openrouter.js';
import { FalAiClient } from './integrations/fal-ai.js';
import { NeynarClient } from './integrations/neynar.js';
import { BaseChainClient } from './integrations/base-chain.js';
import { createContentWorker } from '../workers/content-worker.js';
import { createMetricsWorker } from '../workers/metrics-worker.js';
import { createPostingWorker } from '../workers/posting-worker.js';
import { createSchedulerWorker } from '../workers/scheduler.js';

interface RuntimeContext {
  redis: IORedis;
  engine: AgentEngine;
  scheduler: AgentScheduler;
  pipeline: ContentPipeline;
  skillExecutor: SkillExecutor;
  openrouter: OpenRouterClient;
  falAi: FalAiClient;
  neynar: NeynarClient;
  baseChain: BaseChainClient;
}

let runtimeContext: RuntimeContext | null = null;
let isShuttingDown = false;

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

  // 2. Initialize integration clients
  const openrouter = new OpenRouterClient(config.OPENROUTER_API_KEY);
  const falAi = new FalAiClient(config.FAL_KEY);
  const neynar = new NeynarClient(config.NEYNAR_API_KEY);
  const baseChain = new BaseChainClient({
    rpcUrl: config.BASE_RPC_URL,
    chainId: config.NEXT_PUBLIC_CHAIN_ID,
  });

  logger.info('Integration clients initialized');

  // 3. Initialize core modules
  const pipeline = new ContentPipeline(openrouter, falAi);
  const scheduler = new AgentScheduler(redis);
  const engine = new AgentEngine(pipeline, scheduler);
  const skillExecutor = new SkillExecutor();

  logger.info('Core modules initialized');

  // 4. Initialize BullMQ workers
  const contentWorker = createContentWorker(redis, config.OPENROUTER_API_KEY, config.FAL_KEY);
  const metricsWorker = createMetricsWorker(redis);
  const postingWorker = createPostingWorker(redis, config.NEYNAR_API_KEY);
  const { worker: schedulerWorker, getHealth, shutdown: shutdownScheduler } = createSchedulerWorker(redis);

  logger.info('BullMQ workers initialized');

  // 5. Register graceful shutdown
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress, forcing exit');
      process.exit(1);
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

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

      // Stop chain watchers
      baseChain.stopAllWatchers();

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

  logger.info({
    workers: ['content', 'metrics', 'posting', 'scheduler'],
    integrations: ['openrouter', 'fal-ai', 'neynar', 'base-chain'],
  }, 'OpenClaw Agent Runtime started successfully');

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
