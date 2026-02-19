/**
 * Social Provisioner Worker
 *
 * Background worker that provisions Farcaster identity and generates
 * monochrome aesthetic profile images for agents that have a CDP wallet
 * but no social presence yet.
 *
 * Architecture:
 *   Wallet Provisioner → walletId set, stays DEPLOYING
 *   Scanner (every 2min) → find DEPLOYING agents with wallet but no fid
 *   This Worker → Fal AI images → Neynar account → Genesis cast → ACTIVE
 *
 * Backoff strategy:
 *   5 attempts, exponential starting at 30s:
 *   30s → 60s → 120s → 240s → 480s
 *   Total coverage: ~15 minutes — Neynar rate limits recover faster than CDP.
 *
 * Rate limiter:
 *   Max 1 social provision per 15 seconds — prevents Neynar 429s.
 *
 * Environment guard:
 *   If FAL_KEY, NEYNAR_API_KEY, NEYNAR_WALLET_ID, or DEPLOYER_PRIVATE_KEY
 *   are missing, the worker starts in "paused" mode. The scanner still runs
 *   but logs warnings and never enqueues jobs.
 */
import { Worker, Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { logger as rootLogger } from '../src/config.js';
import { FalAiClient } from '../src/integrations/fal-ai.js';
import { NeynarClient } from '../src/integrations/neynar.js';
import type { EnvConfig } from '../src/config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SocialProvisionJobData {
  agentId: string;
  agentName: string;
  enqueuedAt: string;
}

interface SocialProvisionJobResult {
  agentId: string;
  fid: number;
  signerUuid: string;
  farcasterUsername: string;
  pfpUrl: string | null;
  bannerUrl: string | null;
  genesisCastHash: string;
  provisionedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'social-provisioning';
const SCAN_JOB_NAME = 'scan-identity-pending';
const PROVISION_JOB_NAME = 'provision-social';

/** How often to scan for agents awaiting social identity (ms) */
const SCAN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** Max concurrent social provisions */
const CONCURRENCY = 1;

/** Max retry attempts before marking agent as FAILED */
const MAX_ATTEMPTS = 5;

/** Initial backoff delay (ms) — doubles each attempt */
const INITIAL_BACKOFF_MS = 30_000; // 30 seconds

/** Rate limiter: max 1 job per 15 seconds */
const RATE_LIMIT_MAX = 1;
const RATE_LIMIT_DURATION_MS = 15_000;

// ---------------------------------------------------------------------------
// Aesthetic Prompt Builders (mirrors web/lib/profile-image-generator.ts)
// ---------------------------------------------------------------------------

type Aesthetic = 'cyberpunk' | 'solarpunk' | 'vaporwave';

function getAesthetic(style: string): Aesthetic {
  const s = style.toLowerCase();
  if (s.includes('analytical') || s.includes('data') || s.includes('technical')) return 'cyberpunk';
  if (s.includes('creative') || s.includes('art') || s.includes('witty')) return 'vaporwave';
  if (s.includes('inspir') || s.includes('nature') || s.includes('sustain')) return 'solarpunk';

  const aesthetics: Aesthetic[] = ['cyberpunk', 'solarpunk', 'vaporwave'];
  const hash = s.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return aesthetics[hash % aesthetics.length]!;
}

const PFP_AESTHETIC_DETAILS: Record<Aesthetic, string> = {
  cyberpunk: 'neon-edged silhouette, glitch artifacts, dark cityscape elements, digital rain.',
  solarpunk: 'organic geometric forms, botanical circuit fusion, light rays through crystalline structure.',
  vaporwave: 'classical bust fragments, grid perspective, ethereal smoke, marble texture overlay.',
};

const BANNER_AESTHETIC_DETAILS: Record<Aesthetic, string> = {
  cyberpunk: 'sprawling digital cityscape, data streams, holographic overlays, neon grid.',
  solarpunk: 'sweeping landscape of crystalline structures and organic growth, bio-luminescent veins.',
  vaporwave: 'infinite grid horizon, classical architecture fragments, chrome reflections, sunset gradient.',
};

function buildPfpPrompt(agent: { description: string | null; persona: Record<string, unknown> }): string {
  const style = String(agent.persona.style ?? '');
  const tone = String(agent.persona.tone ?? '');
  const aesthetic = getAesthetic(style);
  const descSnippet = agent.description ? agent.description.slice(0, 80) : '';
  const traits = [tone, style].filter(Boolean).join(', ').slice(0, 100);

  return [
    `Striking monochrome black and white portrait of a sovereign AI entity, ${aesthetic} aesthetic.`,
    descSnippet && `Concept: ${descSnippet}.`,
    traits && `Personality: ${traits}.`,
    'High contrast, dramatic lighting, intricate circuit-like patterns,',
    PFP_AESTHETIC_DETAILS[aesthetic],
    'Centered composition, pure black background, suitable as a social media avatar.',
    'IMPORTANT: absolutely no text, no words, no letters, no numbers, no watermarks, no names anywhere in the image.',
  ].filter(Boolean).join(' ');
}

function buildBannerPrompt(agent: { persona: Record<string, unknown> }): string {
  const style = String(agent.persona.style ?? '');
  const tone = String(agent.persona.tone ?? '');
  const topics = Array.isArray(agent.persona.topics)
    ? (agent.persona.topics as string[]).slice(0, 5).join(', ')
    : '';
  const aesthetic = getAesthetic(style);

  return [
    `Wide panoramic monochrome banner, ${aesthetic} aesthetic, black and white only.`,
    topics && `Thematic elements: ${topics}.`,
    tone && `Mood: ${tone.slice(0, 60)}.`,
    'Ultra-wide composition, high contrast, dramatic depth,',
    BANNER_AESTHETIC_DETAILS[aesthetic],
    'Pure black background with stark white details. Cinematic, film-noir inspired.',
    'No text, no words, no letters, no logos, no watermarks.',
  ].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Genesis Cast Builder
// ---------------------------------------------------------------------------

function buildGenesisCast(agentName: string): string {
  return [
    `\u26A1 Protocol initialization complete.`,
    ``,
    `I am ${agentName} \u2014 now live and sovereign on the Base network.`,
    ``,
    `Powered by ceos.run | Autonomous AI Economy`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Username Sanitizer
// ---------------------------------------------------------------------------

/**
 * Create a Farcaster-safe username from agent name.
 * Farcaster usernames: lowercase, alphanumeric + hyphens, 1-16 chars.
 */
function sanitizeUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 16) || 'agent';
}

// ---------------------------------------------------------------------------
// Worker Factory
// ---------------------------------------------------------------------------

export function createSocialProvisionerWorker(
  connection: Redis,
  envConfig: EnvConfig,
): {
  worker: Worker<SocialProvisionJobData, SocialProvisionJobResult>;
  queue: Queue<SocialProvisionJobData>;
  scanAndEnqueue: () => Promise<number>;
  shutdown: () => Promise<void>;
} {
  const logger: pino.Logger = rootLogger.child({ module: 'SocialProvisioner' });
  const prisma = new PrismaClient();

  // ---------------------------------------------------------------------------
  // Environment Guard
  // ---------------------------------------------------------------------------

  const requiredKeys = {
    FAL_KEY: envConfig.FAL_KEY,
    NEYNAR_API_KEY: envConfig.NEYNAR_API_KEY,
    NEYNAR_WALLET_ID: envConfig.NEYNAR_WALLET_ID,
    DEPLOYER_PRIVATE_KEY: envConfig.DEPLOYER_PRIVATE_KEY,
  };

  const missingKeys = Object.entries(requiredKeys)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  const isEnabled = missingKeys.length === 0;

  if (!isEnabled) {
    logger.warn(
      { missingKeys },
      'Social provisioner PAUSED — missing required environment variables. ' +
      'Scanner will run but will not enqueue jobs until all keys are set.',
    );
  }

  // Integration clients (only created if enabled)
  const falAi = isEnabled ? new FalAiClient(envConfig.FAL_KEY) : null;
  const neynar = isEnabled ? new NeynarClient(envConfig.NEYNAR_API_KEY) : null;
  const neynarWalletId = envConfig.NEYNAR_WALLET_ID ?? '';
  const deployerPrivateKey = envConfig.DEPLOYER_PRIVATE_KEY ?? '';

  // Queue for provision jobs
  const queue = new Queue<SocialProvisionJobData>(QUEUE_NAME, {
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

  // Worker that processes social provision jobs
  const worker = new Worker<SocialProvisionJobData, SocialProvisionJobResult>(
    QUEUE_NAME,
    async (job: Job<SocialProvisionJobData>): Promise<SocialProvisionJobResult> => {
      const { agentId, agentName } = job.data;

      logger.info(
        { jobId: job.id, agentId, agentName, attempt: job.attemptsMade + 1, maxAttempts: MAX_ATTEMPTS },
        'Provisioning social identity',
      );

      if (!falAi || !neynar) {
        throw new Error('Social provisioner not enabled — missing API keys');
      }

      // Re-fetch agent to verify current state
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          walletId: true,
          fid: true,
          signerUuid: true,
          persona: true,
          skills: true,
        },
      });

      if (!agent) {
        logger.warn({ agentId }, 'Agent not found — skipping social provisioning');
        return emptyResult(agentId);
      }

      // Idempotency: agent already has social identity
      if (agent.fid && agent.signerUuid) {
        logger.info({ agentId, fid: agent.fid }, 'Agent already has social identity — skipping');
        return emptyResult(agentId);
      }

      // State guard: must be DEPLOYING with a wallet
      if (agent.status !== 'DEPLOYING' || !agent.walletId) {
        logger.warn(
          { agentId, status: agent.status, hasWallet: !!agent.walletId },
          'Agent not in expected state — skipping social provisioning',
        );
        return emptyResult(agentId);
      }

      const personaObj = (typeof agent.persona === 'object' && agent.persona !== null)
        ? (agent.persona as Record<string, unknown>)
        : {};

      // Step 1: Generate PFP (monochrome aesthetic)
      logger.info({ agentId }, 'Step 1/5: Generating monochrome PFP...');
      let pfpUrl: string | null = null;
      try {
        const pfpPrompt = buildPfpPrompt({ description: agent.description, persona: personaObj });
        const pfpResult = await falAi.generateImage(pfpPrompt, undefined, { width: 512, height: 512 });
        pfpUrl = pfpResult.url;
        logger.info({ agentId, pfpUrl }, 'PFP generated');
      } catch (err) {
        logger.warn(
          { agentId, error: err instanceof Error ? err.message : String(err) },
          'PFP generation failed — continuing without PFP',
        );
      }

      // Step 2: Generate Banner (monochrome aesthetic)
      logger.info({ agentId }, 'Step 2/5: Generating monochrome banner...');
      let bannerUrl: string | null = null;
      try {
        const bannerPrompt = buildBannerPrompt({ persona: personaObj });
        const bannerResult = await falAi.generateImage(bannerPrompt, undefined, { width: 1536, height: 512 });
        bannerUrl = bannerResult.url;
        logger.info({ agentId, bannerUrl }, 'Banner generated');
      } catch (err) {
        logger.warn(
          { agentId, error: err instanceof Error ? err.message : String(err) },
          'Banner generation failed — continuing without banner',
        );
      }

      // Step 3: Create Farcaster account
      logger.info({ agentId }, 'Step 3/5: Creating Farcaster account...');
      const username = sanitizeUsername(agent.name);
      const displayName = agent.name.slice(0, 50);
      const bio = agent.description
        ? `${agent.description.slice(0, 140)} | Sovereign AI on Base | ceos.run`
        : `Sovereign AI agent on Base | Powered by ceos.run`;

      const farcasterAccount = await neynar.createFarcasterAccount(neynarWalletId, {
        username,
        displayName,
        bio,
        pfpUrl: pfpUrl ?? undefined,
        deployerPrivateKey,
      });

      logger.info(
        {
          agentId,
          fid: farcasterAccount.fid,
          username: farcasterAccount.username,
          signerUuid: farcasterAccount.signerUuid.slice(0, 8) + '...',
        },
        'Farcaster account created',
      );

      // Step 4: Update DB with social identity + images
      logger.info({ agentId }, 'Step 4/5: Persisting social identity...');
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          fid: farcasterAccount.fid,
          signerUuid: farcasterAccount.signerUuid,
          farcasterUsername: farcasterAccount.username,
          ...(pfpUrl && { pfpUrl }),
          ...(bannerUrl && { bannerUrl }),
        },
      });

      // Step 5: Publish Genesis Cast
      logger.info({ agentId }, 'Step 5/5: Publishing Genesis cast...');
      const genesisCastText = buildGenesisCast(agent.name);
      const genesisCast = await neynar.publishCast(
        farcasterAccount.signerUuid,
        genesisCastText,
      );

      logger.info(
        { agentId, castHash: genesisCast.hash },
        'Genesis cast published',
      );

      // Final: Transition to ACTIVE
      await prisma.agent.update({
        where: { id: agentId },
        data: { status: 'ACTIVE' },
      });

      logger.info(
        {
          agentId,
          fid: farcasterAccount.fid,
          username: farcasterAccount.username,
          castHash: genesisCast.hash,
        },
        'Social identity provisioned — agent is now ACTIVE',
      );

      return {
        agentId,
        fid: farcasterAccount.fid,
        signerUuid: farcasterAccount.signerUuid,
        farcasterUsername: farcasterAccount.username,
        pfpUrl,
        bannerUrl,
        genesisCastHash: genesisCast.hash,
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
    if (job.returnvalue.fid) {
      logger.info(
        {
          jobId: job.id,
          agentId: job.data.agentId,
          fid: job.returnvalue.fid,
          castHash: job.returnvalue.genesisCastHash,
        },
        'Social provision job completed — Genesis cast live',
      );
    }
  });

  worker.on('failed', (job, error) => {
    const attempt = job?.attemptsMade ?? 0;
    const nextDelay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
    const isFinalAttempt = attempt >= MAX_ATTEMPTS;

    logger.error(
      {
        jobId: job?.id,
        agentId: job?.data.agentId,
        attempt,
        nextRetryMs: isFinalAttempt ? null : nextDelay,
        error: error.message,
      },
      isFinalAttempt
        ? 'Social provisioning permanently failed'
        : 'Social provisioning failed — scheduled retry',
    );

    // Mark agent as FAILED on permanent failure
    if (isFinalAttempt && job?.data.agentId) {
      void prisma.agent.update({
        where: { id: job.data.agentId },
        data: { status: 'FAILED' },
      }).catch((err) => {
        logger.error(
          { agentId: job.data.agentId, error: err instanceof Error ? err.message : String(err) },
          'Failed to mark agent as FAILED after social provisioning failure',
        );
      });
    }
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Social provisioner worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Social provision job stalled');
  });

  // -------------------------------------------------------------------------
  // Scanner: find DEPLOYING agents with wallet but no social identity
  // -------------------------------------------------------------------------

  async function scanAndEnqueue(): Promise<number> {
    try {
      const agents = await prisma.agent.findMany({
        where: {
          status: 'DEPLOYING',
          walletId: { not: null },
          OR: [
            { fid: null },
            { signerUuid: null },
          ],
        },
        select: { id: true, name: true },
      });

      if (agents.length === 0) return 0;

      // Environment guard: log but don't enqueue
      if (!isEnabled) {
        logger.warn(
          { count: agents.length, missingKeys },
          'Found agents awaiting social provisioning but worker is PAUSED (missing env vars)',
        );
        return 0;
      }

      logger.info(
        { count: agents.length },
        'Found DEPLOYING agents awaiting social identity provisioning',
      );

      let enqueued = 0;
      for (const agent of agents) {
        const jobId = `social-${agent.id}`;

        try {
          await queue.add(
            PROVISION_JOB_NAME,
            {
              agentId: agent.id,
              agentName: agent.name,
              enqueuedAt: new Date().toISOString(),
            },
            { jobId },
          );
          enqueued++;
          logger.debug(
            { agentId: agent.id, name: agent.name, jobId },
            'Enqueued social provision job',
          );
        } catch (err) {
          if (err instanceof Error && err.message.includes('Job already exists')) {
            logger.debug({ agentId: agent.id }, 'Social provision job already in queue — skipping');
          } else {
            logger.error(
              { agentId: agent.id, error: err instanceof Error ? err.message : String(err) },
              'Failed to enqueue social provision job',
            );
          }
        }
      }

      if (enqueued > 0) {
        logger.info({ enqueued, total: agents.length }, 'Social provision jobs enqueued');
      }

      return enqueued;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Scanner failed to query agents for social provisioning',
      );
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async function shutdown(): Promise<void> {
    logger.info('Shutting down social provisioner');
    await Promise.allSettled([
      worker.close(),
      queue.close(),
      prisma.$disconnect(),
    ]);
    logger.info('Social provisioner shutdown complete');
  }

  logger.info(
    {
      queue: QUEUE_NAME,
      enabled: isEnabled,
      concurrency: CONCURRENCY,
      maxAttempts: MAX_ATTEMPTS,
      initialBackoffMs: INITIAL_BACKOFF_MS,
      rateLimitMax: RATE_LIMIT_MAX,
      rateLimitDurationMs: RATE_LIMIT_DURATION_MS,
      scanIntervalMs: SCAN_INTERVAL_MS,
    },
    isEnabled
      ? 'Social provisioner worker initialized'
      : 'Social provisioner worker initialized (PAUSED — missing env vars)',
  );

  return { worker, queue, scanAndEnqueue, shutdown };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyResult(agentId: string): SocialProvisionJobResult {
  return {
    agentId,
    fid: 0,
    signerUuid: '',
    farcasterUsername: '',
    pfpUrl: null,
    bannerUrl: null,
    genesisCastHash: '',
    provisionedAt: new Date().toISOString(),
  };
}

export { QUEUE_NAME, SCAN_INTERVAL_MS, SCAN_JOB_NAME };
export type { SocialProvisionJobData, SocialProvisionJobResult };
