import { Worker, Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';
import { NeynarClient, type Cast } from '../src/integrations/neynar.js';

interface PostingJobData {
  agentId: string;
  signerUuid: string;
  text: string;
  mediaUrl?: string;
  contentType: string;
  parts?: string[];
  channelId?: string;
}

interface PostingJobResult {
  agentId: string;
  casts: CastResult[];
  publishedAt: string;
}

interface CastResult {
  hash: string;
  text: string;
  isThread: boolean;
  index: number;
}

const QUEUE_NAME = 'scheduled-posting';
const CONCURRENCY = 3;

// Rate limit: max 10 posts per hour per agent
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_POSTS_PER_WINDOW = 10;

export function createPostingWorker(
  connection: Redis,
  neynarApiKey: string,
): Worker<PostingJobData, PostingJobResult> {
  const logger: pino.Logger = rootLogger.child({ module: 'PostingWorker' });
  const neynar = new NeynarClient(neynarApiKey);

  // Track posting rate per agent
  const postingHistory: Map<string, number[]> = new Map();

  const worker = new Worker<PostingJobData, PostingJobResult>(
    QUEUE_NAME,
    async (job: Job<PostingJobData>): Promise<PostingJobResult> => {
      const { agentId, signerUuid, text, mediaUrl, contentType, parts, channelId } = job.data;

      logger.info(
        { jobId: job.id, agentId, contentType, hasMedia: !!mediaUrl, isThread: !!parts },
        'Processing posting job',
      );

      // Check rate limit
      if (!checkRateLimit(agentId, postingHistory, logger)) {
        throw new Error(`Agent ${agentId} has exceeded posting rate limit`);
      }

      await job.updateProgress(10);

      const castResults: CastResult[] = [];

      if (parts && parts.length > 1) {
        // Publish as thread
        logger.info({ agentId, partCount: parts.length }, 'Publishing thread');

        const threadOptions = channelId ? { channelId } : undefined;
        const casts = await neynar.publishThread(signerUuid, parts, threadOptions);

        for (let i = 0; i < casts.length; i++) {
          const cast = casts[i];
          if (cast) {
            castResults.push({
              hash: cast.hash,
              text: cast.text,
              isThread: true,
              index: i,
            });
          }
        }

        await job.updateProgress(80);
      } else {
        // Publish single cast
        const embeds = mediaUrl ? [{ url: mediaUrl }] : undefined;

        const cast = await neynar.publishCast(signerUuid, text, {
          embeds,
          channelId,
        });

        castResults.push({
          hash: cast.hash,
          text: cast.text,
          isThread: false,
          index: 0,
        });

        await job.updateProgress(80);
      }

      // Record in rate limit tracker
      recordPosting(agentId, postingHistory);

      await job.updateProgress(100);

      const result: PostingJobResult = {
        agentId,
        casts: castResults,
        publishedAt: new Date().toISOString(),
      };

      logger.info(
        {
          jobId: job.id,
          agentId,
          castCount: castResults.length,
          firstCastHash: castResults[0]?.hash,
        },
        'Posting complete',
      );

      return result;
    },
    {
      connection: connection.duplicate(),
      concurrency: CONCURRENCY,
      limiter: {
        max: 5,
        duration: 60_000, // 5 jobs per minute
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, agentId: job.data.agentId }, 'Posting job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, agentId: job?.data.agentId, error: error.message },
      'Posting job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Posting worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Posting job stalled');
  });

  logger.info({ queue: QUEUE_NAME, concurrency: CONCURRENCY }, 'Posting worker initialized');

  return worker;
}

function checkRateLimit(
  agentId: string,
  history: Map<string, number[]>,
  logger: pino.Logger,
): boolean {
  const now = Date.now();
  const agentHistory = history.get(agentId) ?? [];
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Clean old entries
  const recentPosts = agentHistory.filter((ts) => ts > windowStart);
  history.set(agentId, recentPosts);

  if (recentPosts.length >= MAX_POSTS_PER_WINDOW) {
    logger.warn(
      { agentId, postsInWindow: recentPosts.length, maxAllowed: MAX_POSTS_PER_WINDOW },
      'Agent rate limit exceeded',
    );
    return false;
  }

  return true;
}

function recordPosting(agentId: string, history: Map<string, number[]>): void {
  const agentHistory = history.get(agentId) ?? [];
  agentHistory.push(Date.now());
  history.set(agentId, agentHistory);
}

export type { PostingJobData, PostingJobResult, CastResult };
