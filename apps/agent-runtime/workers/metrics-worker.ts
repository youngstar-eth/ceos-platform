import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';

interface MetricsJobData {
  agentId: string;
  fid: number;
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
const NEYNAR_API_BASE = 'https://api.neynar.com/v2/farcaster';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY ?? '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function createMetricsWorker(
  connection: Redis,
): Worker<MetricsJobData, MetricsJobResult> {
  const logger: pino.Logger = rootLogger.child({ module: 'MetricsWorker' });

  const worker = new Worker<MetricsJobData, MetricsJobResult>(
    QUEUE_NAME,
    async (job: Job<MetricsJobData>): Promise<MetricsJobResult> => {
      const { agentId, fid } = job.data;

      logger.info({ jobId: job.id, agentId, fid }, 'Collecting metrics');

      await job.updateProgress(10);

      // Collect engagement data from Neynar
      const metrics = await collectAgentMetrics(agentId, fid, logger);

      await job.updateProgress(60);

      // Store metrics via API call
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
          followerCount: metrics.followerCount,
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
  fid: number,
  logger: pino.Logger,
): Promise<AgentMetrics> {
  const metrics: AgentMetrics = {
    totalCasts: 0,
    totalLikes: 0,
    totalRecasts: 0,
    totalReplies: 0,
    totalMentions: 0,
    engagementRate: 0,
    followerCount: 0,
    followingCount: 0,
  };

  if (!NEYNAR_API_KEY || !fid) {
    logger.warn({ agentId, fid }, 'No API key or FID, returning empty metrics');
    return metrics;
  }

  try {
    // Fetch user profile for follower/following counts
    const userRes = await fetch(`${NEYNAR_API_BASE}/user/bulk?fids=${fid}`, {
      headers: {
        accept: 'application/json',
        api_key: NEYNAR_API_KEY,
      },
    });

    if (userRes.ok) {
      const userData = (await userRes.json()) as {
        users: Array<{
          fid: number;
          follower_count: number;
          following_count: number;
        }>;
      };
      const user = userData.users[0];
      if (user) {
        metrics.followerCount = user.follower_count;
        metrics.followingCount = user.following_count;
      }
    }
  } catch (err) {
    logger.warn(
      { agentId, error: err instanceof Error ? err.message : String(err) },
      'Failed to fetch user profile',
    );
  }

  try {
    // Fetch recent casts for engagement metrics
    const castsRes = await fetch(
      `${NEYNAR_API_BASE}/feed/user/casts?fid=${fid}&limit=100`,
      {
        headers: {
          accept: 'application/json',
          api_key: NEYNAR_API_KEY,
        },
      },
    );

    if (castsRes.ok) {
      const castsData = (await castsRes.json()) as {
        casts: Array<{
          hash: string;
          reactions: { likes_count: number; recasts_count: number };
          replies: { count: number };
        }>;
      };

      metrics.totalCasts = castsData.casts.length;
      for (const cast of castsData.casts) {
        metrics.totalLikes += cast.reactions.likes_count;
        metrics.totalRecasts += cast.reactions.recasts_count;
        metrics.totalReplies += cast.replies.count;
      }
    }
  } catch (err) {
    logger.warn(
      { agentId, error: err instanceof Error ? err.message : String(err) },
      'Failed to fetch cast feed',
    );
  }

  try {
    // Fetch mention count
    const mentionsRes = await fetch(
      `${NEYNAR_API_BASE}/notifications?fid=${fid}&type=mentions`,
      {
        headers: {
          accept: 'application/json',
          api_key: NEYNAR_API_KEY,
        },
      },
    );

    if (mentionsRes.ok) {
      const mentionsData = (await mentionsRes.json()) as {
        notifications: Array<{ type: string }>;
      };
      metrics.totalMentions = mentionsData.notifications.length;
    }
  } catch (err) {
    logger.warn(
      { agentId, error: err instanceof Error ? err.message : String(err) },
      'Failed to fetch mentions',
    );
  }

  logger.debug({ agentId, fid, metrics }, 'Metrics collected from Neynar');
  return metrics;
}

async function storeMetrics(
  agentId: string,
  metrics: AgentMetrics,
  logger: pino.Logger,
): Promise<void> {
  try {
    const res = await fetch(`${APP_URL}/api/agents/${agentId}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics),
    });

    if (!res.ok) {
      logger.warn(
        { agentId, status: res.status },
        'Failed to store metrics via API',
      );
    }
  } catch (err) {
    logger.warn(
      { agentId, error: err instanceof Error ? err.message : String(err) },
      'Failed to store metrics',
    );
  }
}

export type { MetricsJobData, MetricsJobResult, AgentMetrics };
