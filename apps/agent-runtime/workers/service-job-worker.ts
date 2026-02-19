/**
 * Service Job Maintenance Worker
 *
 * This BullMQ-powered worker handles automated service job lifecycle tasks:
 * 1. Expire jobs that have exceeded their TTL (CREATED/ACCEPTED → EXPIRED)
 * 2. Future: Dispute resolution, auto-refunds, etc.
 *
 * Runs on a repeatable schedule (every 60 seconds) to catch expired jobs.
 *
 * V2 Changes:
 * - Removed `failedReason` from EXPIRED update (field no longer exists)
 * - Status update is now the only data written on expiration
 */
import { Worker, Queue, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';

const QUEUE_NAME = 'service-job-maintenance';
const CONCURRENCY = 1; // Maintenance jobs don't need parallelism

interface MaintenanceJobData {
  task: 'expire-overdue-jobs';
  triggeredAt: string;
}

interface MaintenanceJobResult {
  expiredCount: number;
  processedAt: string;
}

/**
 * Create the service job maintenance worker and its scheduling queue.
 *
 * Returns the worker, queue, and a shutdown function.
 */
export function createServiceJobWorker(connection: Redis) {
  const logger: pino.Logger = rootLogger.child({ module: 'ServiceJobWorker' });
  const prisma = new PrismaClient();

  const queue = new Queue<MaintenanceJobData>(QUEUE_NAME, { connection });

  const worker = new Worker<MaintenanceJobData, MaintenanceJobResult>(
    QUEUE_NAME,
    async (job: Job<MaintenanceJobData>): Promise<MaintenanceJobResult> => {
      if (job.data.task !== 'expire-overdue-jobs') {
        logger.warn({ task: job.data.task }, 'Unknown maintenance task');
        return { expiredCount: 0, processedAt: new Date().toISOString() };
      }

      return await expireOverdueJobs(prisma, logger);
    },
    {
      connection,
      concurrency: CONCURRENCY,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on('completed', (job, result) => {
    if (result.expiredCount > 0) {
      logger.info(
        { jobId: job.id, expiredCount: result.expiredCount },
        'Service job maintenance completed',
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      'Service job maintenance failed',
    );
  });

  logger.info('Service job maintenance worker initialized');

  return {
    worker,
    queue,
    shutdown: async () => {
      await worker.close();
      await queue.close();
      await prisma.$disconnect();
      logger.info('Service job maintenance worker shut down');
    },
  };
}

/**
 * Find and expire all service jobs that have exceeded their TTL.
 *
 * Only jobs in CREATED or ACCEPTED status can be expired.
 * DELIVERING jobs are not expired — the seller is actively working.
 *
 * V2: No `failedReason` field — only status is updated to EXPIRED.
 */
async function expireOverdueJobs(
  prisma: PrismaClient,
  logger: pino.Logger,
): Promise<MaintenanceJobResult> {
  const now = new Date();

  // Find all expirable jobs (CREATED or ACCEPTED with expiresAt in the past)
  const expiredJobs = await prisma.serviceJob.updateMany({
    where: {
      status: { in: ['CREATED', 'ACCEPTED'] },
      expiresAt: { lt: now },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  if (expiredJobs.count > 0) {
    logger.info(
      { expiredCount: expiredJobs.count },
      'Expired overdue service jobs',
    );

    // TODO: RLAIF — log expiration events for training data
    // TODO (Phase 3): Trigger x402 refund for expired jobs
  }

  return {
    expiredCount: expiredJobs.count,
    processedAt: now.toISOString(),
  };
}

/**
 * Schedule the repeatable maintenance job.
 * Call this during runtime bootstrap.
 */
export async function scheduleServiceJobMaintenance(queue: Queue): Promise<void> {
  await queue.add(
    'expire-overdue-jobs',
    { task: 'expire-overdue-jobs', triggeredAt: new Date().toISOString() },
    {
      jobId: 'service-job-maintenance-repeatable',
      repeat: { every: 60_000 }, // Every 60 seconds
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  );
}
