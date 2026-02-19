/**
 * Service Job Executor Worker
 *
 * This BullMQ-powered worker closes the sovereign economy loop by
 * autonomously fulfilling service jobs that seller agents are hired for.
 *
 * Flow:
 *   1. Poll for ACCEPTED jobs assigned to locally-running agents
 *   2. Transition job → DELIVERING (signal work has begun)
 *   3. Route the job's `requirements.capability` to the SkillExecutor
 *   4. On success → transition to COMPLETED with deliverables JSON
 *   5. On failure → transition to DISPUTED with error context
 *
 * The executor uses the seller agent's wallet to authenticate API calls
 * via the ServiceClient, ensuring sovereignty: the agent itself (not
 * a centralized system) is the one fulfilling and settling the job.
 *
 * Design Decisions:
 * - DISPUTED (not FAILED) for errors: The ServiceJobStatus enum doesn't
 *   include FAILED. DISPUTED is the correct terminal state when execution
 *   fails after acceptance — it signals to the buyer that resolution is needed.
 * - SkillExecutor routing: Jobs are routed via `requirements.capability` to
 *   the registered skill system. This makes the executor pluggable: register
 *   new skills and the executor automatically handles new job types.
 * - Batch polling (not event-driven): Repeatable BullMQ job every 15 seconds.
 *   This is simpler than webhooks and resilient to missed events.
 */
import { Worker, Queue, type Job } from 'bullmq';
import { Prisma, PrismaClient, type ServiceJobStatus } from '@prisma/client';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';
import { SkillExecutor, type SkillContext } from '../src/core/skill-executor.js';

const QUEUE_NAME = 'service-job-executor';
const CONCURRENCY = 3; // Execute up to 3 jobs in parallel
const DEFAULT_EXECUTION_TIMEOUT_MS = 120_000; // 2 minutes per job

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecutorJobData {
  task: 'execute-accepted-jobs';
  triggeredAt: string;
}

interface ExecutorJobResult {
  executedCount: number;
  failedCount: number;
  processedAt: string;
}

/**
 * Context needed for each agent whose jobs we might execute.
 * Populated from the runtime's running agents list.
 */
interface AgentExecutionContext {
  agentId: string;
  walletAddress: string;
  persona: string;
}

// ── Worker Factory ───────────────────────────────────────────────────────────

/**
 * Create the service job executor worker and its scheduling queue.
 *
 * @param connection - Redis connection for BullMQ
 * @param skillExecutor - The runtime's skill execution engine
 * @param getLocalAgents - Callback returning the set of agents running locally.
 *   This function is called on each poll to get the current list of agents
 *   whose jobs we should execute. The executor only picks up jobs for agents
 *   that are actively running in THIS runtime instance.
 * @param apiBaseUrl - The ceos.run API base URL for PATCH calls
 */
export function createServiceExecutorWorker(
  connection: Redis,
  skillExecutor: SkillExecutor,
  getLocalAgents: () => AgentExecutionContext[],
  apiBaseUrl: string,
) {
  const logger: pino.Logger = rootLogger.child({ module: 'ServiceExecutor' });
  const prisma = new PrismaClient();

  const queue = new Queue<ExecutorJobData>(QUEUE_NAME, { connection });

  const worker = new Worker<ExecutorJobData, ExecutorJobResult>(
    QUEUE_NAME,
    async (job: Job<ExecutorJobData>): Promise<ExecutorJobResult> => {
      if (job.data.task !== 'execute-accepted-jobs') {
        logger.warn({ task: job.data.task }, 'Unknown executor task');
        return { executedCount: 0, failedCount: 0, processedAt: new Date().toISOString() };
      }

      return await pollAndExecuteJobs(prisma, skillExecutor, getLocalAgents, apiBaseUrl, logger);
    },
    {
      connection,
      concurrency: CONCURRENCY,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  );

  worker.on('completed', (job, result) => {
    if (result.executedCount > 0 || result.failedCount > 0) {
      logger.info(
        { jobId: job.id, executed: result.executedCount, failed: result.failedCount },
        'Service executor poll completed',
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      'Service executor poll failed',
    );
  });

  logger.info('Service job executor worker initialized');

  return {
    worker,
    queue,
    shutdown: async () => {
      await worker.close();
      await queue.close();
      await prisma.$disconnect();
      logger.info('Service job executor worker shut down');
    },
  };
}

// ── Core Execution Logic ─────────────────────────────────────────────────────

/**
 * Poll for ACCEPTED jobs assigned to local agents and execute them.
 *
 * For each ACCEPTED job:
 * 1. Transition to DELIVERING (claim the job)
 * 2. Route to SkillExecutor based on requirements.capability
 * 3. On success: transition to COMPLETED with deliverables
 * 4. On failure: transition to DISPUTED with error context
 */
async function pollAndExecuteJobs(
  prisma: PrismaClient,
  skillExecutor: SkillExecutor,
  getLocalAgents: () => AgentExecutionContext[],
  apiBaseUrl: string,
  logger: pino.Logger,
): Promise<ExecutorJobResult> {
  const localAgents = getLocalAgents();

  if (localAgents.length === 0) {
    return { executedCount: 0, failedCount: 0, processedAt: new Date().toISOString() };
  }

  const localAgentIds = localAgents.map((a) => a.agentId);
  const agentMap = new Map(localAgents.map((a) => [a.agentId, a]));

  // Find all ACCEPTED jobs for our local agents
  const acceptedJobs = await prisma.serviceJob.findMany({
    where: {
      sellerAgentId: { in: localAgentIds },
      status: 'ACCEPTED' as ServiceJobStatus,
      expiresAt: { gt: new Date() }, // Only non-expired jobs
    },
    include: {
      offering: {
        select: { slug: true, name: true, category: true, maxLatencyMs: true },
      },
    },
    orderBy: { createdAt: 'asc' }, // FIFO — oldest first
    take: 10, // Batch limit per poll cycle
  });

  if (acceptedJobs.length === 0) {
    return { executedCount: 0, failedCount: 0, processedAt: new Date().toISOString() };
  }

  logger.info(
    { jobCount: acceptedJobs.length, agentIds: localAgentIds },
    'Found ACCEPTED jobs to execute',
  );

  let executedCount = 0;
  let failedCount = 0;

  // Execute jobs sequentially to avoid overwhelming the skill executor
  for (const job of acceptedJobs) {
    const agentCtx = agentMap.get(job.sellerAgentId);
    if (!agentCtx) continue; // Safety check

    try {
      const success = await executeServiceJob(
        prisma,
        skillExecutor,
        job,
        agentCtx,
        apiBaseUrl,
        logger,
      );

      if (success) {
        executedCount++;
      } else {
        failedCount++;
      }
    } catch (err) {
      failedCount++;
      logger.error(
        {
          jobId: job.id,
          agentId: job.sellerAgentId,
          error: err instanceof Error ? err.message : String(err),
        },
        'Unhandled error executing service job',
      );
    }
  }

  return {
    executedCount,
    failedCount,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Execute a single service job through the full lifecycle:
 * ACCEPTED → DELIVERING → COMPLETED (or DISPUTED on failure).
 *
 * @returns true if job completed successfully, false on failure
 */
async function executeServiceJob(
  prisma: PrismaClient,
  skillExecutor: SkillExecutor,
  job: {
    id: string;
    sellerAgentId: string;
    requirements: unknown;
    priceUsdc: bigint;
    offering: { slug: string; name: string; category: string; maxLatencyMs: number };
  },
  agentCtx: AgentExecutionContext,
  apiBaseUrl: string,
  logger: pino.Logger,
): Promise<boolean> {
  const jobId = job.id;
  const startTime = Date.now();

  logger.info(
    {
      jobId,
      agentId: agentCtx.agentId,
      offering: job.offering.slug,
      category: job.offering.category,
    },
    'Executing service job',
  );

  // ── Step 1: Transition to DELIVERING ─────────────────────────────────────
  const claimSuccess = await transitionJobStatus(
    apiBaseUrl,
    jobId,
    'DELIVERING',
    agentCtx.walletAddress,
    undefined,
    logger,
  );

  if (!claimSuccess) {
    logger.warn({ jobId }, 'Failed to claim job (transition to DELIVERING) — skipping');
    return false;
  }

  // ── Step 2: Route to SkillExecutor ───────────────────────────────────────
  const requirements = job.requirements as Record<string, unknown>;
  const capability = (requirements.capability as string) ?? job.offering.category;

  // Build the skill context from the job's requirements
  const skillContext: SkillContext = {
    agentId: agentCtx.agentId,
    agentPersona: agentCtx.persona,
    parameters: {
      ...requirements,
      jobId,
      offeringSlug: job.offering.slug,
      offeringCategory: job.offering.category,
    },
  };

  // Determine skill to execute:
  // 1. Explicit skillId in requirements
  // 2. Capability name as skill ID
  // 3. Category name as skill ID
  // 4. Fallback to 'content-generation' (the most common skill)
  const skillId =
    (requirements.skillId as string) ??
    resolveSkillId(capability, skillExecutor);

  logger.info(
    { jobId, capability, skillId },
    'Routing job to skill executor',
  );

  const timeoutMs = Math.min(
    job.offering.maxLatencyMs,
    DEFAULT_EXECUTION_TIMEOUT_MS,
  );

  const result = await executeWithGlobalTimeout(
    () => skillExecutor.executeSkill(skillId, skillContext),
    timeoutMs,
  );

  const executionTimeMs = Date.now() - startTime;

  // ── Step 3: Settle the job ───────────────────────────────────────────────

  if (result.success) {
    // Build deliverables from skill output
    const deliverables = {
      output: result.output,
      executionTimeMs: result.executionTimeMs,
      skillId: result.skillId,
      completedAt: new Date().toISOString(),
    };

    const completionSuccess = await transitionJobStatus(
      apiBaseUrl,
      jobId,
      'COMPLETED',
      agentCtx.walletAddress,
      deliverables,
      logger,
    );

    if (completionSuccess) {
      logger.info(
        {
          jobId,
          agentId: agentCtx.agentId,
          skillId,
          executionTimeMs,
          priceUsdc: job.priceUsdc.toString(),
        },
        'Service job executed and completed — buyback & burn triggered',
      );

      // TODO: RLAIF — log execution success for training data
      //   (capability, skill used, execution time, deliverables quality)

      return true;
    }

    // Edge case: skill succeeded but PATCH failed.
    // The deliverables are lost but the job remains in DELIVERING.
    // The maintenance worker will eventually expire it.
    logger.error(
      { jobId, executionTimeMs },
      'Skill succeeded but failed to transition to COMPLETED',
    );
    return false;
  }

  // ── Failure path: transition to DISPUTED ─────────────────────────────────
  //
  // The ServiceJobStatus enum doesn't include FAILED. DISPUTED is the
  // appropriate terminal state when execution fails after acceptance.
  // The buyer can then request a refund or re-negotiate.
  //
  // Note: DISPUTED is a terminal state in the VALID_TRANSITIONS map,
  // but the PATCH endpoint only allows seller-driven transitions.
  // We need to handle this server-side — see the route update.

  const errorDeliverables = {
    error: result.output,
    executionTimeMs: result.executionTimeMs,
    skillId: result.skillId,
    failedAt: new Date().toISOString(),
    reason: 'Skill execution failed or timed out',
  };

  // Attempt to transition to DISPUTED for error visibility.
  // If the route doesn't support DELIVERING → DISPUTED, log the error.
  const disputeSuccess = await transitionJobStatus(
    apiBaseUrl,
    jobId,
    'DISPUTED',
    agentCtx.walletAddress,
    errorDeliverables,
    logger,
  );

  if (!disputeSuccess) {
    // Fallback: write error context directly to the job's deliverables
    // so it's not silently lost. The job stays in DELIVERING until
    // the maintenance worker expires it or manual intervention.
    try {
      await prisma.serviceJob.update({
        where: { id: jobId },
        data: {
          deliverables: errorDeliverables as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (dbErr) {
      logger.error(
        { jobId, error: dbErr instanceof Error ? dbErr.message : String(dbErr) },
        'Failed to persist error deliverables — error context lost',
      );
    }
  }

  logger.warn(
    {
      jobId,
      agentId: agentCtx.agentId,
      skillId,
      executionTimeMs,
      error: result.output,
    },
    'Service job execution failed — transitioned to DISPUTED',
  );

  // TODO: RLAIF — log execution failure for training data
  //   (capability, skill used, error type, execution time)

  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a capability string to the best matching registered skill ID.
 *
 * Priority:
 * 1. Exact match on skill ID
 * 2. Partial match (capability contains skill ID or vice versa)
 * 3. Category-based fallback (content → content-generation, etc.)
 * 4. Default: 'content-generation'
 */
function resolveSkillId(capability: string, skillExecutor: SkillExecutor): string {
  const skills = skillExecutor.getRegisteredSkills();
  const capLower = capability.toLowerCase();

  // 1. Exact match
  const exact = skills.find((s) => s.id === capLower);
  if (exact) return exact.id;

  // 2. Partial match (either direction)
  const partial = skills.find(
    (s) => capLower.includes(s.id) || s.id.includes(capLower),
  );
  if (partial) return partial.id;

  // 3. Category-based mapping
  const categoryMap: Record<string, string> = {
    content: 'content-generation',
    analysis: 'trend-analysis',
    trading: 'trend-analysis', // Trading uses analytics under the hood
    engagement: 'engagement-analysis',
    networking: 'engagement-analysis', // Networking is engagement-adjacent
  };
  const mapped = categoryMap[capLower];
  if (mapped && skills.find((s) => s.id === mapped)) return mapped;

  // 4. Default fallback
  const firstSkill = skills[0];
  return firstSkill ? firstSkill.id : 'content-generation';
}

/**
 * Transition a service job's status via the PATCH API.
 *
 * Uses the seller agent's wallet address for authentication.
 */
async function transitionJobStatus(
  apiBaseUrl: string,
  jobId: string,
  newStatus: string,
  walletAddress: string,
  deliverables: Record<string, unknown> | undefined,
  logger: pino.Logger,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/services/jobs/${jobId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
      },
      body: JSON.stringify({
        status: newStatus,
        ...(deliverables !== undefined && { deliverables }),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(
        { jobId, newStatus, httpStatus: res.status, body },
        'Failed to transition job status via API',
      );
      return false;
    }

    logger.debug(
      { jobId, newStatus },
      'Job status transitioned via API',
    );
    return true;
  } catch (err) {
    logger.error(
      {
        jobId,
        newStatus,
        error: err instanceof Error ? err.message : String(err),
      },
      'Network error transitioning job status',
    );
    return false;
  }
}

/**
 * Execute a function with a global timeout.
 * Returns a failed SkillResult on timeout instead of throwing.
 */
async function executeWithGlobalTimeout(
  fn: () => Promise<{ success: boolean; output: unknown; executionTimeMs: number; skillId: string }>,
  timeoutMs: number,
): Promise<{ success: boolean; output: unknown; executionTimeMs: number; skillId: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        success: false,
        output: { error: `Execution timed out after ${timeoutMs}ms` },
        executionTimeMs: timeoutMs,
        skillId: 'timeout',
      });
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          output: { error: err instanceof Error ? err.message : String(err) },
          executionTimeMs: 0,
          skillId: 'error',
        });
      });
  });
}

/**
 * Schedule the repeatable executor poll job.
 * Call this during runtime bootstrap.
 */
export async function scheduleServiceExecutor(queue: Queue): Promise<void> {
  await queue.add(
    'execute-accepted-jobs',
    { task: 'execute-accepted-jobs', triggeredAt: new Date().toISOString() },
    {
      jobId: 'service-executor-repeatable',
      repeat: { every: 15_000 }, // Every 15 seconds
      removeOnComplete: 200,
      removeOnFail: 100,
    },
  );
}

export type { AgentExecutionContext };
