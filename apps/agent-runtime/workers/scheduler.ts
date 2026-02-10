import { Worker, Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';

interface SchedulerJobData {
  agentId: string;
  strategy: string;
  scheduledAt: string;
}

interface SchedulerJobResult {
  agentId: string;
  contentJobId: string;
  dispatchedAt: string;
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
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function createSchedulerWorker(
  connection: Redis,
): {
  worker: Worker<SchedulerJobData, SchedulerJobResult>;
  getHealth: () => Promise<HealthStatus>;
  shutdown: () => Promise<void>;
} {
  const logger: pino.Logger = rootLogger.child({ module: 'SchedulerWorker' });

  const contentQueue = new Queue(CONTENT_QUEUE_NAME, {
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
        'Scheduler dispatching content generation',
      );

      // Create content generation job
      const contentJob = await contentQueue.add(
        'generate-content',
        {
          agentId,
          agentName: `Agent-${agentId}`, // Placeholder — real data from DB
          agentPersona: '', // Placeholder — loaded from agent config
          contentType: 'auto',
          strategy,
        },
        {
          priority: 1,
          delay: calculateJitter(),
        },
      );

      const contentJobId = contentJob.id ?? 'unknown';

      logger.info(
        { jobId: job.id, agentId, contentJobId },
        'Content generation job dispatched',
      );

      return {
        agentId,
        contentJobId,
        dispatchedAt: new Date().toISOString(),
      };
    },
    {
      connection: connection.duplicate(),
      concurrency: 10,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, agentId: job.data.agentId }, 'Scheduler job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, agentId: job?.data.agentId, error: error.message },
      'Scheduler job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Scheduler worker error');
  });

  // Start health monitoring
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
        isHealthy: failed < 100, // Unhealthy if too many failures
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
      schedulerQueue.close(),
    ]);

    logger.info('Scheduler worker shutdown complete');
  }

  logger.info(
    { schedulerQueue: SCHEDULER_QUEUE_NAME, contentQueue: CONTENT_QUEUE_NAME },
    'Scheduler worker initialized',
  );

  return { worker, getHealth, shutdown };
}

function calculateJitter(): number {
  // 0-60 seconds random delay
  return Math.floor(Math.random() * 60_000);
}

export type { SchedulerJobData, SchedulerJobResult, HealthStatus };
