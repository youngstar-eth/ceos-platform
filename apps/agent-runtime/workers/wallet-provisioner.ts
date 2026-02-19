/**
 * Wallet Provisioner Worker
 *
 * Background worker that provisions Coinbase CDP MPC wallets for agents
 * in DEPLOYING status. Handles CDP rate limits (HTTP 429) via BullMQ's
 * built-in exponential backoff.
 *
 * Architecture:
 *   Deploy Route → agent.status = DEPLOYING → 201 (instant)
 *   Scanner (every 2min) → find DEPLOYING agents → enqueue jobs
 *   This Worker → CDP Wallet.create() → encrypt → DB → status = ACTIVE
 *
 * Backoff strategy:
 *   10 attempts, exponential starting at 60s:
 *   60s → 120s → 240s → 480s → 960s → 1920s → 3840s → 7680s → 15360s → 30720s
 *   Total coverage: ~17 hours — enough to survive CDP's 24h rate limit windows.
 *
 * Rate limiter:
 *   Max 1 wallet creation per 30 seconds — prevents burst-triggering the 429.
 */
import { Worker, Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { logger as rootLogger } from '../src/config.js';
import { createWalletStore, type WalletProvisionResult } from '@repo/wallet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WalletProvisionJobData {
  agentId: string;
  enqueuedAt: string;
}

interface WalletProvisionJobResult {
  agentId: string;
  walletId: string;
  address: string;
  network: string;
  provisionedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'wallet-provisioning';
const SCAN_JOB_NAME = 'scan-deploying-agents';
const PROVISION_JOB_NAME = 'provision-wallet';

/** How often to scan for DEPLOYING agents without wallets (ms) */
const SCAN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** Max concurrent wallet provisions — keep at 1 to avoid CDP rate limits */
const CONCURRENCY = 1;

/** Max retry attempts before marking agent as FAILED */
const MAX_ATTEMPTS = 10;

/** Initial backoff delay (ms) — doubles each attempt */
const INITIAL_BACKOFF_MS = 60_000; // 1 minute

/** Rate limiter: max 1 job per 30 seconds */
const RATE_LIMIT_MAX = 1;
const RATE_LIMIT_DURATION_MS = 30_000;

// ---------------------------------------------------------------------------
// CDP Error Detection
// ---------------------------------------------------------------------------

/**
 * Detect if an error is a CDP rate limit (HTTP 429).
 *
 * CDP SDK throws ResourceExhaustedError with httpCode: 429, apiCode: 'resource_exhausted',
 * and apiMessage: 'rate limit exceeded for operation: ...'.
 *
 * HOWEVER, BullMQ serializes errors to Redis as {message, stack} and reconstructs them
 * as plain Error objects. This strips all CDP-specific properties (httpCode, apiCode, etc.).
 * The CDP APIError also calls super() without a message, so error.message is empty.
 *
 * To survive serialization, we:
 *   1. Check live CDP properties (httpCode, apiCode) — works inside the job processor catch
 *   2. Check error.message for rate-limit keywords — works after normalization (see normalizeCdpError)
 *   3. Check BullMQ's job.failedReason string — works in event handlers and queue inspection
 *
 * @param error - The error to check (live CDP error or deserialized BullMQ error)
 * @param failedReason - Optional BullMQ failedReason string from job metadata
 */
function isCdpRateLimitError(error: unknown, failedReason?: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;

  // Live CDP properties (available in processor catch block)
  if (e.httpCode === 429) return true;
  if (e.apiCode === 'resource_exhausted') return true;
  if (e.name === 'ResourceExhaustedError') return true;

  // Normalized message (available after normalizeCdpError wraps the error)
  if (typeof e.message === 'string' && /rate.?limit|429|resource.?exhausted/i.test(e.message)) return true;

  // BullMQ failedReason fallback (available in event handlers / queue inspection)
  if (failedReason && /rate.?limit|429|resource.?exhausted/i.test(failedReason)) return true;

  return false;
}

/**
 * Extract a readable error message from CDP SDK errors.
 * CDP errors have non-standard properties (apiMessage, apiCode, httpCode).
 */
function extractCdpErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as Record<string, unknown>;
  return (
    (e.apiMessage as string) ||
    (e.message as string) ||
    String(error)
  );
}

/**
 * Normalize a CDP SDK error into a standard Error with a meaningful message.
 *
 * The CDP SDK's APIError extends AxiosError but calls super() without passing
 * the error message, so error.message is always empty (""). When BullMQ
 * serializes this to Redis, it stores failedReason = "" — making the error
 * invisible in logs, queue inspection, and event handlers.
 *
 * This function creates a new Error that preserves the CDP error details in
 * its .message property, ensuring BullMQ stores a useful failedReason.
 * The original error is attached as .cause for stack trace preservation.
 */
function normalizeCdpError(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error(String(error));
  const e = error as Record<string, unknown>;

  const httpCode = e.httpCode ?? 'unknown';
  const apiCode = e.apiCode ?? 'unknown';
  const apiMessage = e.apiMessage ?? e.message ?? String(error);
  const name = (error as Error).name ?? 'CDPError';

  const normalizedMessage = `[CDP ${name}] HTTP ${httpCode} / ${apiCode}: ${apiMessage}`;

  const normalized = new Error(normalizedMessage);
  normalized.name = name;
  normalized.cause = error;

  return normalized;
}

// ---------------------------------------------------------------------------
// Worker Factory
// ---------------------------------------------------------------------------

export function createWalletProvisionerWorker(
  connection: Redis,
): {
  worker: Worker<WalletProvisionJobData, WalletProvisionJobResult>;
  queue: Queue<WalletProvisionJobData>;
  scanAndEnqueue: () => Promise<number>;
  shutdown: () => Promise<void>;
} {
  const logger: pino.Logger = rootLogger.child({ module: 'WalletProvisioner' });
  const prisma = new PrismaClient();
  const walletStore = createWalletStore(prisma);

  // Queue for provision jobs
  const queue = new Queue<WalletProvisionJobData>(QUEUE_NAME, {
    connection: connection.duplicate(),
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: INITIAL_BACKOFF_MS,
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });

  // Worker that processes provision jobs
  const worker = new Worker<WalletProvisionJobData, WalletProvisionJobResult>(
    QUEUE_NAME,
    async (job: Job<WalletProvisionJobData>): Promise<WalletProvisionJobResult> => {
      const { agentId } = job.data;

      logger.info(
        { jobId: job.id, agentId, attempt: job.attemptsMade + 1, maxAttempts: MAX_ATTEMPTS },
        'Provisioning Sovereign MPC Wallet',
      );

      // Verify agent is still in DEPLOYING state (may have been cancelled)
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { id: true, status: true, walletId: true },
      });

      if (!agent) {
        logger.warn({ agentId }, 'Agent not found — skipping provisioning');
        // Don't retry — agent was deleted
        return {
          agentId,
          walletId: '',
          address: '',
          network: '',
          provisionedAt: new Date().toISOString(),
        };
      }

      // Already has a wallet — skip (idempotency guard)
      if (agent.walletId) {
        logger.info({ agentId, walletId: agent.walletId }, 'Agent already has wallet — skipping');
        return {
          agentId,
          walletId: agent.walletId,
          address: '',
          network: '',
          provisionedAt: new Date().toISOString(),
        };
      }

      // Not in DEPLOYING state — skip (may have been cancelled or failed)
      if (agent.status !== 'DEPLOYING') {
        logger.warn(
          { agentId, status: agent.status },
          'Agent not in DEPLOYING state — skipping provisioning',
        );
        return {
          agentId,
          walletId: '',
          address: '',
          network: '',
          provisionedAt: new Date().toISOString(),
        };
      }

      // Attempt wallet provisioning via @repo/wallet
      let result: WalletProvisionResult;
      try {
        result = await walletStore.provisionWallet(agentId);
      } catch (error) {
        // Normalize CDP error so BullMQ stores a meaningful failedReason.
        // Without this, APIError.message is "" and the error is invisible in Redis.
        const normalized = normalizeCdpError(error);

        if (isCdpRateLimitError(error)) {
          logger.warn(
            {
              agentId,
              attempt: job.attemptsMade + 1,
              error: normalized.message,
            },
            'CDP rate limit hit — will retry with exponential backoff',
          );
          // Re-throw NORMALIZED error so BullMQ stores a useful failedReason
          throw normalized;
        }

        // Non-rate-limit error on final attempt → mark agent as FAILED
        if (job.attemptsMade + 1 >= MAX_ATTEMPTS) {
          logger.error(
            { agentId, attempts: job.attemptsMade + 1, error: normalized.message },
            'Wallet provisioning permanently failed — marking agent as FAILED',
          );
          await prisma.agent.update({
            where: { id: agentId },
            data: { status: 'FAILED' },
          });
        }

        // Re-throw NORMALIZED error for BullMQ retry handling
        throw normalized;
      }

      // Success — wallet secured, agent stays DEPLOYING for social provisioning
      // The social-provisioner worker will transition to ACTIVE after
      // Farcaster identity setup and Genesis cast are published.
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          onChainAddress: result.address,
        },
      });

      logger.info(
        {
          agentId,
          walletId: result.walletId,
          address: result.address,
          network: result.network,
          attempts: job.attemptsMade + 1,
        },
        'Sovereign Wallet Secured — awaiting social identity provisioning',
      );

      return {
        agentId,
        walletId: result.walletId,
        address: result.address,
        network: result.network,
        provisionedAt: new Date().toISOString(),
      };
    },
    {
      connection: connection.duplicate(),
      concurrency: CONCURRENCY,
      limiter: {
        max: RATE_LIMIT_MAX,
        duration: RATE_LIMIT_DURATION_MS,
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  );

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  worker.on('completed', (job) => {
    if (job.returnvalue.walletId) {
      logger.info(
        { jobId: job.id, agentId: job.data.agentId, walletId: job.returnvalue.walletId },
        'Wallet provision job completed',
      );
    }
  });

  worker.on('failed', (job, error) => {
    const attempt = (job?.attemptsMade ?? 0);
    // Pass failedReason as fallback — after normalization, this contains the
    // CDP error details even though BullMQ deserialized the error as plain Error.
    const failedReason = job?.failedReason ?? '';
    const isRateLimit = isCdpRateLimitError(error, failedReason);
    const nextDelay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);

    if (isRateLimit) {
      logger.warn(
        {
          jobId: job?.id,
          agentId: job?.data.agentId,
          attempt,
          nextRetryMs: nextDelay,
          nextRetryHuman: `${Math.round(nextDelay / 1000)}s`,
          reason: error.message || failedReason,
        },
        'Wallet provision rate-limited — scheduled retry',
      );
    } else {
      logger.error(
        {
          jobId: job?.id,
          agentId: job?.data.agentId,
          attempt,
          error: error.message || failedReason || String(error),
        },
        'Wallet provision job failed',
      );
    }
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Wallet provisioner worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Wallet provision job stalled');
  });

  // -------------------------------------------------------------------------
  // Scanner: find DEPLOYING agents and enqueue provision jobs
  // -------------------------------------------------------------------------

  /**
   * Promote delayed jobs whose fire time has passed.
   *
   * BullMQ's rate limiter can cause delayed jobs to "stick" in the delayed set
   * even after their backoff timer expires — the worker doesn't poll for newly-
   * ready delayed jobs when it's idle and rate-limited. This function runs on
   * every scanner tick (every 2 min) to nudge overdue jobs into the waiting state.
   */
  async function promoteOverdueJobs(): Promise<number> {
    try {
      const delayed = await queue.getDelayed();
      const now = Date.now();
      let promoted = 0;

      for (const job of delayed) {
        const firesAt = job.timestamp + (job.delay || 0);
        if (firesAt <= now) {
          await job.promote();
          promoted++;
          logger.debug(
            { jobId: job.id, overdueBy: Math.round((now - firesAt) / 1000) + 's' },
            'Promoted overdue delayed job',
          );
        }
      }

      if (promoted > 0) {
        logger.info({ promoted }, 'Promoted overdue delayed wallet provision jobs');
      }

      return promoted;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to promote overdue delayed jobs',
      );
      return 0;
    }
  }

  /**
   * Scan for DEPLOYING agents that don't yet have a wallet.
   * Enqueue a provision job for each, deduped by agentId.
   * Also promotes overdue delayed jobs (see promoteOverdueJobs).
   */
  async function scanAndEnqueue(): Promise<number> {
    // Promote stuck delayed jobs first — ensures backoff retries fire on time
    await promoteOverdueJobs();

    try {
      const agents = await prisma.agent.findMany({
        where: {
          status: 'DEPLOYING',
          walletId: null,
        },
        select: { id: true, name: true },
      });

      if (agents.length === 0) return 0;

      logger.info(
        { count: agents.length },
        'Found DEPLOYING agents awaiting wallet provisioning',
      );

      let enqueued = 0;
      for (const agent of agents) {
        // Deduplicate: use agentId as jobId so BullMQ won't create duplicates
        const jobId = `provision-${agent.id}`;

        try {
          await queue.add(
            PROVISION_JOB_NAME,
            {
              agentId: agent.id,
              enqueuedAt: new Date().toISOString(),
            },
            { jobId },
          );
          enqueued++;
          logger.debug(
            { agentId: agent.id, name: agent.name, jobId },
            'Enqueued wallet provision job',
          );
        } catch (err) {
          // Job with this ID already exists — skip (expected for in-progress provisions)
          if (err instanceof Error && err.message.includes('Job already exists')) {
            logger.debug({ agentId: agent.id }, 'Provision job already in queue — skipping');
          } else {
            logger.error(
              { agentId: agent.id, error: err instanceof Error ? err.message : String(err) },
              'Failed to enqueue provision job',
            );
          }
        }
      }

      if (enqueued > 0) {
        logger.info({ enqueued, total: agents.length }, 'Wallet provision jobs enqueued');
      }

      return enqueued;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Scanner failed to query DEPLOYING agents',
      );
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async function shutdown(): Promise<void> {
    logger.info('Shutting down wallet provisioner');
    await Promise.allSettled([
      worker.close(),
      queue.close(),
      prisma.$disconnect(),
    ]);
    logger.info('Wallet provisioner shutdown complete');
  }

  logger.info(
    {
      queue: QUEUE_NAME,
      concurrency: CONCURRENCY,
      maxAttempts: MAX_ATTEMPTS,
      initialBackoffMs: INITIAL_BACKOFF_MS,
      rateLimitMax: RATE_LIMIT_MAX,
      rateLimitDurationMs: RATE_LIMIT_DURATION_MS,
      scanIntervalMs: SCAN_INTERVAL_MS,
    },
    'Wallet provisioner worker initialized',
  );

  return { worker, queue, scanAndEnqueue, shutdown };
}

export { QUEUE_NAME, SCAN_INTERVAL_MS, SCAN_JOB_NAME };
export type { WalletProvisionJobData, WalletProvisionJobResult };
