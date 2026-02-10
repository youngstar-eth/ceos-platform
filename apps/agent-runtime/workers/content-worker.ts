import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';
import { ContentPipeline } from '../src/core/content-pipeline.js';
import { OpenRouterClient } from '../src/integrations/openrouter.js';
import { FalAiClient } from '../src/integrations/fal-ai.js';
import { getStrategy } from '../src/strategies/posting.js';

interface ContentJobData {
  agentId: string;
  agentName: string;
  agentPersona: string;
  contentType: string;
  strategy: string;
}

interface ContentJobResult {
  agentId: string;
  text: string;
  mediaUrl?: string;
  contentType: string;
  model: string;
  tokensUsed: number;
  parts?: string[];
  generatedAt: string;
}

const QUEUE_NAME = 'content-generation';
const CONCURRENCY = 5;

export function createContentWorker(
  connection: Redis,
  openrouterApiKey: string,
  falApiKey: string,
): Worker<ContentJobData, ContentJobResult> {
  const logger: pino.Logger = rootLogger.child({ module: 'ContentWorker' });
  const openrouter = new OpenRouterClient(openrouterApiKey);
  const falAi = new FalAiClient(falApiKey);
  const pipeline = new ContentPipeline(openrouter, falAi);

  const worker = new Worker<ContentJobData, ContentJobResult>(
    QUEUE_NAME,
    async (job: Job<ContentJobData>): Promise<ContentJobResult> => {
      const { agentId, agentName, agentPersona, strategy: strategyName } = job.data;

      logger.info(
        { jobId: job.id, agentId, strategy: strategyName },
        'Processing content generation job',
      );

      await job.updateProgress(10);

      const strategy = getStrategy(strategyName);
      const agentConfig = {
        persona: agentPersona,
        name: agentName,
        agentId,
      };

      await job.updateProgress(30);

      const content = await pipeline.generateContent(agentConfig, strategy);

      await job.updateProgress(90);

      const result: ContentJobResult = {
        agentId,
        text: content.text,
        mediaUrl: content.mediaUrl,
        contentType: content.type,
        model: content.model,
        tokensUsed: content.tokensUsed,
        parts: content.parts,
        generatedAt: new Date().toISOString(),
      };

      await job.updateProgress(100);

      logger.info(
        {
          jobId: job.id,
          agentId,
          contentType: content.type,
          textLength: content.text.length,
          hasMedia: !!content.mediaUrl,
        },
        'Content generation complete',
      );

      return result;
    },
    {
      connection: connection.duplicate(),
      concurrency: CONCURRENCY,
      limiter: {
        max: 10,
        duration: 60_000, // 10 jobs per minute
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, agentId: job.data.agentId }, 'Content job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, agentId: job?.data.agentId, error: error.message },
      'Content job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Content worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Content job stalled');
  });

  logger.info({ queue: QUEUE_NAME, concurrency: CONCURRENCY }, 'Content worker initialized');

  return worker;
}
