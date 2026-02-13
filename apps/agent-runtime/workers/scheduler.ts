import { Worker, Queue, QueueEvents, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { logger as rootLogger } from '../src/config.js';

interface SchedulerJobData {
  agentId: string;
  strategy: string;
  scheduledAt: string;
}

interface SchedulerJobResult {
  agentId: string;
  castHashes: string[];
  publishedAt: string;
}

interface HealthStatus {
  isHealthy: boolean;
  activeAgents: number;
  queueStats: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  lastCheckAt: string;
}

const SCHEDULER_QUEUE_NAME = 'scheduled-posting';
const CONTENT_QUEUE_NAME = 'content-generation';
const POSTING_QUEUE_NAME = 'farcaster-posting';
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function createSchedulerWorker(
  connection: Redis,
): {
  worker: Worker<SchedulerJobData, SchedulerJobResult>;
  getHealth: () => Promise<HealthStatus>;
  shutdown: () => Promise<void>;
} {
  const logger: pino.Logger = rootLogger.child({ module: 'SchedulerWorker' });
  const prisma = new PrismaClient();

  const contentQueue = new Queue(CONTENT_QUEUE_NAME, {
    connection: connection.duplicate(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });

  const postingQueue = new Queue(POSTING_QUEUE_NAME, {
    connection: connection.duplicate(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });

  const schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, {
    connection: connection.duplicate(),
  });

  const contentEvents = new QueueEvents(CONTENT_QUEUE_NAME, {
    connection: connection.duplicate(),
  });

  let healthCheckTimer: NodeJS.Timeout | null = null;
  let lastHealthStatus: HealthStatus = {
    isHealthy: true,
    activeAgents: 0,
    queueStats: { waiting: 0, active: 0, completed: 0, failed: 0 },
    lastCheckAt: new Date().toISOString(),
  };

  const worker = new Worker<SchedulerJobData, SchedulerJobResult>(
    SCHEDULER_QUEUE_NAME,
    async (job: Job<SchedulerJobData>): Promise<SchedulerJobResult> => {
      const { agentId, strategy } = job.data;

      logger.info(
        { jobId: job.id, agentId, strategy },
        'Scheduler dispatching autonomous cycle',
      );

      // Step 1: Load real agent data from database
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!agent) {
        throw new Error(`Agent ${agentId} not found in database`);
      }

      if (agent.status !== 'ACTIVE') {
        logger.warn({ agentId, status: agent.status }, 'Agent not active, skipping cycle');
        return { agentId, castHashes: [], publishedAt: new Date().toISOString() };
      }

      if (!agent.signerUuid || agent.signerUuid.startsWith('demo-signer-')) {
        logger.warn({ agentId }, 'Agent has no valid signer, skipping posting');
        return { agentId, castHashes: [], publishedAt: new Date().toISOString() };
      }

      const persona = typeof agent.persona === 'string'
        ? agent.persona
        : (agent.persona as Record<string, unknown>)?.description as string ?? '';

      // Step 2: Generate content
      logger.info({ agentId }, 'Dispatching content generation');
      const contentJob = await contentQueue.add(
        'generate-content',
        {
          agentId,
          agentName: agent.name,
          agentPersona: persona,
          contentType: 'auto',
          strategy,
        },
        { priority: 1 },
      );

      // Step 3: Wait for content generation to complete
      const contentResult = await contentJob.waitUntilFinished(contentEvents, 120_000) as {
        agentId: string;
        text: string;
        mediaUrl?: string;
        contentType: string;
        parts?: string[];
      };

      logger.info(
        { agentId, contentType: contentResult.contentType, hasMedia: !!contentResult.mediaUrl },
        'Content generated, dispatching to Farcaster',
      );

      // Step 4: Queue posting job with real data
      const postingJob = await postingQueue.add(
        'publish-to-farcaster',
        {
          agentId,
          signerUuid: agent.signerUuid,
          text: contentResult.text,
          mediaUrl: contentResult.mediaUrl,
          contentType: contentResult.contentType,
          parts: contentResult.parts,
        },
      );

      // Step 5: Wait for posting to complete
      const postingEvents = new QueueEvents(POSTING_QUEUE_NAME, {
        connection: connection.duplicate(),
      });

      try {
        const postingResult = await postingJob.waitUntilFinished(postingEvents, 60_000) as {
          agentId: string;
          casts: Array<{ hash: string; text: string }>;
          publishedAt: string;
        };

        const castHashes = postingResult.casts?.map((c) => c.hash) ?? [];

        // Step 6: Store casts in database
        for (const cast of postingResult.casts ?? []) {
          await prisma.cast.create({
            data: {
              agentId,
              content: cast.text,
              hash: cast.hash,
              type: contentResult.contentType === 'thread' ? 'THREAD' : contentResult.contentType === 'media' ? 'MEDIA' : 'ORIGINAL',
              publishedAt: new Date(),
              mediaUrl: contentResult.mediaUrl,
            },
          });
        }

        logger.info(
          { agentId, castCount: castHashes.length, hashes: castHashes },
          'Autonomous cycle complete — posted to Farcaster',
        );

        return {
          agentId,
          castHashes,
          publishedAt: postingResult.publishedAt,
        };
      } finally {
        await postingEvents.close();
      }
    },
    {
      connection: connection.duplicate(),
      concurrency: 5,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, agentId: job.data.agentId }, 'Autonomous cycle completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, agentId: job?.data.agentId, error: error.message },
      'Autonomous cycle failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Scheduler worker error');
  });

  // Health monitoring
  healthCheckTimer = setInterval(() => {
    void performHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);

  async function performHealthCheck(): Promise<HealthStatus> {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        schedulerQueue.getWaitingCount(),
        schedulerQueue.getActiveCount(),
        schedulerQueue.getCompletedCount(),
        schedulerQueue.getFailedCount(),
      ]);

      const repeatableJobs = await schedulerQueue.getRepeatableJobs();

      lastHealthStatus = {
        isHealthy: failed < 100,
        activeAgents: repeatableJobs.length,
        queueStats: { waiting, active, completed, failed },
        lastCheckAt: new Date().toISOString(),
      };

      logger.debug(lastHealthStatus, 'Health check completed');

      if (!lastHealthStatus.isHealthy) {
        logger.warn(lastHealthStatus, 'System health degraded');
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Health check failed',
      );
      lastHealthStatus = {
        ...lastHealthStatus,
        isHealthy: false,
        lastCheckAt: new Date().toISOString(),
      };
    }

    return lastHealthStatus;
  }

  async function getHealth(): Promise<HealthStatus> {
    return performHealthCheck();
  }

  async function shutdown(): Promise<void> {
    logger.info('Shutting down scheduler worker');

    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }

    await Promise.allSettled([
      worker.close(),
      contentQueue.close(),
      postingQueue.close(),
      schedulerQueue.close(),
      contentEvents.close(),
      prisma.$disconnect(),
    ]);

    logger.info('Scheduler worker shutdown complete');
  }

  logger.info(
    { schedulerQueue: SCHEDULER_QUEUE_NAME, contentQueue: CONTENT_QUEUE_NAME, postingQueue: POSTING_QUEUE_NAME },
    'Scheduler worker initialized — full autonomous pipeline',
  );

  return { worker, getHealth, shutdown };
}

function calculateJitter(): number {
  return Math.floor(Math.random() * 60_000);
}

export type { SchedulerJobData, SchedulerJobResult, HealthStatus };
