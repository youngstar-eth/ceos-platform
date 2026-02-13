import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';

interface MetricsJobData {
  agentId: string;
  scheduledAt: string;
}

interface MetricsJobResult {
  agentId: string;
  metrics: AgentMetrics;
  collectedAt: string;
}

interface AgentMetrics {
  totalCasts: number;
  totalLikes: number;
  totalRecasts: number;
  totalReplies: number;
  totalMentions: number;
  engagementRate: number;
  followerCount: number;
  followingCount: number;
}

const QUEUE_NAME = 'metrics-collection';
const CONCURRENCY = 3;

export function createMetricsWorker(
  connection: Redis,
): Worker<MetricsJobData, MetricsJobResult> {
  const logger: pino.Logger = rootLogger.child({ module: 'MetricsWorker' });

  const worker = new Worker<MetricsJobData, MetricsJobResult>(
    QUEUE_NAME,
    async (job: Job<MetricsJobData>): Promise<MetricsJobResult> => {
      const { agentId } = job.data;

      logger.info({ jobId: job.id, agentId }, 'Collecting metrics');

      await job.updateProgress(10);

      // Collect engagement data
      // In production: query Neynar API for cast metrics, follower counts, etc.
      const metrics = await collectAgentMetrics(agentId, logger);

      await job.updateProgress(60);

      // Store metrics via API call
      // In production: POST to /api/agents/{agentId}/metrics
      await storeMetrics(agentId, metrics, logger);

      await job.updateProgress(90);

      // Calculate engagement rate
      const totalInteractions = metrics.totalLikes + metrics.totalRecasts + metrics.totalReplies;
      const engagementRate =
        metrics.totalCasts > 0 ? totalInteractions / metrics.totalCasts : 0;
      metrics.engagementRate = Math.round(engagementRate * 10000) / 10000;

      await job.updateProgress(100);

      logger.info(
        {
          jobId: job.id,
          agentId,
          engagementRate: metrics.engagementRate,
          totalCasts: metrics.totalCasts,
        },
        'Metrics collection complete',
      );

      return {
        agentId,
        metrics,
        collectedAt: new Date().toISOString(),
      };
    },
    {
      connection: connection.duplicate(),
      concurrency: CONCURRENCY,
      limiter: {
        max: 20,
        duration: 60_000, // 20 jobs per minute
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, agentId: job.data.agentId }, 'Metrics job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, agentId: job?.data.agentId, error: error.message },
      'Metrics job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Metrics worker error');
  });

  logger.info({ queue: QUEUE_NAME, concurrency: CONCURRENCY }, 'Metrics worker initialized');

  return worker;
}

async function collectAgentMetrics(
  agentId: string,
  logger: pino.Logger,
): Promise<AgentMetrics> {
  // Placeholder: In production, this queries the Neynar API
  // and aggregates metrics from the database
  logger.debug({ agentId }, 'Fetching agent metrics from external sources');

  // Return placeholder structure - actual implementation would call Neynar
  return {
    totalCasts: 0,
    totalLikes: 0,
    totalRecasts: 0,
    totalReplies: 0,
    totalMentions: 0,
    engagementRate: 0,
    followerCount: 0,
    followingCount: 0,
  };
}

async function storeMetrics(
  agentId: string,
  metrics: AgentMetrics,
  logger: pino.Logger,
): Promise<void> {
  // Placeholder: In production, this POSTs to the API layer
  // which stores metrics in PostgreSQL via Prisma
  logger.debug({ agentId, metrics }, 'Storing metrics');
}

export type { MetricsJobData, MetricsJobResult, AgentMetrics };
