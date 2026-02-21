/**
 * Social Hunter Worker — Autonomous Lead Generation
 *
 * BullMQ worker that orchestrates the Ear → Brain → Mouth pipeline:
 *
 *   1. THE EAR (Ingest):  Poll Neynar channel feeds + keyword searches
 *                          for casts from potential buyers.
 *
 *   2. THE BRAIN (Triage): LLM evaluates each cast for sales opportunity,
 *                          scores 1-10, and generates a natural pitch.
 *
 *   3. THE MOUTH (Engage): Replies to high-scoring casts with a persona-
 *                          injected pitch embedding the agent's hire link.
 *
 * Anti-Spam Safeguards:
 *   - Redis SET dedup (48h TTL) prevents re-processing same casts
 *   - DB unique constraint [agentId, targetCastHash] prevents double replies
 *   - 24h cooldown per targetFid-agent pair
 *   - 5 replies/hour + 20 replies/day per agent
 *   - Channel rotation (max 3 per cycle) to distribute API load
 *   - Self-cast skip (agent.fid === cast.author.fid)
 *   - LLM triage threshold (score >= 7 to engage)
 */

import { Worker, Queue, type Job } from 'bullmq';
import { PrismaClient, SocialHuntStatus } from '@prisma/client';
import type IORedis from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../src/config.js';
import type { NeynarClient, NeynarChannelCast } from '../src/integrations/neynar.js';
import type { OpenRouterClient } from '../src/integrations/openrouter.js';
import { triageCast } from '../src/skills/social-hunter-triage.js';
import {
  CATEGORY_CHANNELS,
  HUNT_KEYWORDS,
  MAX_REPLIES_PER_HOUR,
  MAX_REPLIES_PER_DAY,
  COOLDOWN_MS,
  TRIAGE_THRESHOLD,
  POLL_INTERVAL_MS,
  MAX_CASTS_PER_CYCLE,
  MAX_CHANNELS_PER_CYCLE,
  SEEN_CASTS_KEY,
  SEEN_CASTS_TTL_SECONDS,
} from '../src/config/social-hunter.js';

// ── Types ────────────────────────────────────────────────────────────────

interface SocialHunterJobData {
  agentId: string;
}

interface SocialHunterJobResult {
  castsScanned: number;
  leadsIdentified: number;
  repliesSent: number;
}

const QUEUE_NAME = 'social-hunter';

// ── Candidate Cast (internal flat shape for processing) ──────────────────

interface CandidateCast {
  hash: string;
  authorFid: number;
  authorUsername: string;
  text: string;
  channel: string | null;
  timestamp: string;
}

// ── Factory ──────────────────────────────────────────────────────────────

/**
 * Create the Social Hunter worker and its scheduling queue.
 *
 * Follows the same factory pattern as createServiceJobWorker():
 * returns { worker, queue, shutdown } for registration in index.ts.
 *
 * @param connection - Shared Redis connection (BullMQ duplicates internally)
 * @param neynar - Neynar client for Farcaster API
 * @param llm - OpenRouter client for LLM triage
 */
export function createSocialHunterWorker(
  connection: IORedis,
  neynar: NeynarClient,
  llm: OpenRouterClient,
) {
  const logger: pino.Logger = rootLogger.child({ module: 'SocialHunterWorker' });
  const prisma = new PrismaClient();

  const queue = new Queue<SocialHunterJobData, SocialHunterJobResult>(
    QUEUE_NAME,
    { connection },
  );

  const worker = new Worker<SocialHunterJobData, SocialHunterJobResult>(
    QUEUE_NAME,
    async (job: Job<SocialHunterJobData>): Promise<SocialHunterJobResult> => {
      const { agentId } = job.data;
      const log = logger.child({ agentId, jobId: job.id });

      try {
        return await processHuntCycle(agentId, log, prisma, connection, neynar, llm);
      } catch (err) {
        log.error({ error: (err as Error).message }, 'Social Hunter cycle failed');
        throw err;
      }
    },
    {
      connection,
      concurrency: 1, // Sequential processing — one agent at a time
      limiter: { max: 1, duration: 30_000 }, // Max 1 job per 30s
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  );

  // ── Lifecycle Events ─────────────────────────────────────────────────

  worker.on('completed', (job, result) => {
    if (result.repliesSent > 0) {
      logger.info(
        { jobId: job.id, agentId: job.data.agentId, ...result },
        'Social Hunter cycle completed with engagement',
      );
    }
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, agentId: job?.data.agentId, error: error.message },
      'Social Hunter job failed',
    );
  });

  logger.info('Social Hunter worker initialized');

  return {
    worker,
    queue,
    shutdown: async () => {
      await worker.close();
      await queue.close();
      await prisma.$disconnect();
      logger.info('Social Hunter worker shut down');
    },
  };
}

// ── Core Processing ──────────────────────────────────────────────────────

/**
 * Execute a single hunt cycle for one agent:
 *   1. Load agent + offerings
 *   2. Ear: collect candidate casts
 *   3. Brain: LLM-triage each cast
 *   4. Mouth: reply to qualified leads
 */
async function processHuntCycle(
  agentId: string,
  log: pino.Logger,
  prisma: PrismaClient,
  redis: IORedis,
  neynar: NeynarClient,
  llm: OpenRouterClient,
): Promise<SocialHunterJobResult> {
  // ── 0. Load Agent + Offerings ──────────────────────────────────────

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      sellerOfferings: {
        where: { status: 'ACTIVE' },
        select: {
          slug: true,
          name: true,
          category: true,
          description: true,
          priceUsdc: true,
        },
      },
    },
  });

  if (!agent || !agent.fid || !agent.signerUuid) {
    log.warn('Agent missing Trinity prerequisites (fid/signerUuid), skipping');
    return { castsScanned: 0, leadsIdentified: 0, repliesSent: 0 };
  }

  if (agent.sellerOfferings.length === 0) {
    log.debug('Agent has no active offerings, skipping hunt');
    return { castsScanned: 0, leadsIdentified: 0, repliesSent: 0 };
  }

  // ── 1. THE EAR: Collect Candidate Casts ────────────────────────────

  const candidateCasts = await collectCandidateCasts(
    agent.sellerOfferings.map((o) => o.category),
    neynar,
    log,
  );

  // Dedup against Redis (already-seen casts) + filter self-casts
  const freshCasts = await deduplicateCasts(
    candidateCasts,
    agentId,
    agent.fid,
    redis,
  );

  const castsToProcess = freshCasts.slice(0, MAX_CASTS_PER_CYCLE);
  log.info(
    { total: candidateCasts.size, fresh: freshCasts.length, processing: castsToProcess.length },
    'Ear: casts collected',
  );

  // ── 2. THE BRAIN: Triage Each Cast ─────────────────────────────────

  const qualifiedLeads = await triageCasts(
    castsToProcess,
    agentId,
    agent,
    prisma,
    llm,
    log,
  );

  // ── 3. THE MOUTH: Reply to Qualified Leads ─────────────────────────

  const repliesSent = await engageLeads(
    qualifiedLeads,
    agentId,
    agent.signerUuid,
    prisma,
    neynar,
    log,
  );

  log.info(
    { castsScanned: castsToProcess.length, leadsIdentified: qualifiedLeads.length, repliesSent },
    'Social Hunter cycle complete',
  );

  return {
    castsScanned: castsToProcess.length,
    leadsIdentified: qualifiedLeads.length,
    repliesSent,
  };
}

// ── 1. THE EAR ───────────────────────────────────────────────────────────

/**
 * Collect candidate casts from channel feeds and keyword searches.
 *
 * Only root casts (no replies) are collected — we want to respond to
 * original requests, not jump into existing conversations.
 */
async function collectCandidateCasts(
  categories: string[],
  neynar: NeynarClient,
  log: pino.Logger,
): Promise<Map<string, CandidateCast>> {
  const candidateCasts = new Map<string, CandidateCast>();

  // 1a. Channel feeds — rotate channels to stay under rate limits
  const uniqueCategories = [...new Set(categories)];
  const channels = uniqueCategories.flatMap((cat) => CATEGORY_CHANNELS[cat] ?? []);
  const uniqueChannels = [...new Set(channels)];

  // Round-robin: pick MAX_CHANNELS_PER_CYCLE channels per cycle
  // Shuffle to ensure fair distribution across cycles
  const shuffledChannels = uniqueChannels
    .sort(() => Math.random() - 0.5)
    .slice(0, MAX_CHANNELS_PER_CYCLE);

  for (const channelId of shuffledChannels) {
    try {
      const feed = await neynar.getChannelFeed(channelId, 10);
      for (const cast of feed.casts) {
        addCandidateCast(candidateCasts, cast, channelId);
      }
    } catch (err) {
      log.warn({ channelId, error: (err as Error).message }, 'Failed to fetch channel feed');
    }
  }

  // 1b. Keyword search — pick 2 random keywords per cycle
  const shuffledKeywords = HUNT_KEYWORDS
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);

  for (const keyword of shuffledKeywords) {
    try {
      const results = await neynar.searchCasts(keyword, 5);
      for (const cast of results.casts) {
        addCandidateCast(candidateCasts, cast, cast.channel?.id ?? null);
      }
    } catch (err) {
      log.warn({ keyword, error: (err as Error).message }, 'Failed keyword search');
    }
  }

  return candidateCasts;
}

/**
 * Convert a NeynarChannelCast to our flat CandidateCast shape,
 * skipping replies (only root casts are potential leads).
 */
function addCandidateCast(
  map: Map<string, CandidateCast>,
  cast: NeynarChannelCast,
  channel: string | null,
): void {
  // Skip replies — we only want root casts expressing a need
  if (cast.parent_hash) return;
  // Skip already-collected (same cast from multiple channels/searches)
  if (map.has(cast.hash)) return;

  map.set(cast.hash, {
    hash: cast.hash,
    authorFid: cast.author.fid,
    authorUsername: cast.author.username,
    text: cast.text,
    channel,
    timestamp: cast.timestamp,
  });
}

// ── Dedup ─────────────────────────────────────────────────────────────────

/**
 * Filter out already-seen casts (Redis SET) and self-casts.
 *
 * Uses SISMEMBER for atomic dedup check + SADD to mark as seen.
 * The seen-set expires after 48h to prevent unbounded growth.
 */
async function deduplicateCasts(
  candidateCasts: Map<string, CandidateCast>,
  agentId: string,
  agentFid: number,
  redis: IORedis,
): Promise<CandidateCast[]> {
  const seenKey = SEEN_CASTS_KEY(agentId);
  const freshCasts: CandidateCast[] = [];

  for (const cast of candidateCasts.values()) {
    // Skip self-casts
    if (cast.authorFid === agentFid) continue;

    const alreadySeen = await redis.sismember(seenKey, cast.hash);
    if (!alreadySeen) {
      freshCasts.push(cast);
      await redis.sadd(seenKey, cast.hash);
    }
  }

  // Refresh TTL so the set doesn't grow unbounded
  await redis.expire(seenKey, SEEN_CASTS_TTL_SECONDS);

  return freshCasts;
}

// ── 2. THE BRAIN ─────────────────────────────────────────────────────────

interface QualifiedLead {
  cast: CandidateCast;
  leadId: string;
  pitch: string;
  score: number;
}

/**
 * Run LLM triage on each candidate cast.
 *
 * Creates a SocialHuntLead record for every cast processed (for audit),
 * and returns only the qualified leads (score >= threshold).
 */
async function triageCasts(
  casts: CandidateCast[],
  agentId: string,
  agent: {
    name: string;
    fid: number | null;
    persona: unknown;
    sellerOfferings: Array<{
      slug: string;
      name: string;
      category: string;
      description: string;
      priceUsdc: bigint;
    }>;
  },
  prisma: PrismaClient,
  llm: OpenRouterClient,
  log: pino.Logger,
): Promise<QualifiedLead[]> {
  const qualifiedLeads: QualifiedLead[] = [];
  const persona =
    typeof agent.persona === 'string'
      ? agent.persona
      : ((agent.persona as Record<string, unknown>)?.description as string) ?? 'A helpful AI agent on ceos.run';

  for (const cast of casts) {
    // Check cooldown: skip if we replied to this user recently
    const recentReply = await prisma.socialHuntLead.findFirst({
      where: {
        agentId,
        targetFid: cast.authorFid,
        repliedAt: { gte: new Date(Date.now() - COOLDOWN_MS) },
      },
    });

    if (recentReply) {
      // Record as COOLDOWN for audit trail
      await prisma.socialHuntLead
        .create({
          data: {
            agentId,
            targetCastHash: cast.hash,
            targetFid: cast.authorFid,
            targetUsername: cast.authorUsername,
            targetText: cast.text,
            channel: cast.channel,
            status: SocialHuntStatus.COOLDOWN,
          },
        })
        .catch(() => {
          /* unique constraint = already tracked */
        });
      continue;
    }

    // Run LLM triage
    try {
      const triage = await triageCast(llm, {
        castText: cast.text,
        castAuthor: cast.authorUsername,
        castChannel: cast.channel,
        agentName: agent.name,
        agentPersona: persona,
        offerings: agent.sellerOfferings.map((o) => ({
          ...o,
          priceUsdc: o.priceUsdc.toString(),
        })),
        hireBaseUrl: 'https://ceos.run/hire',
      });

      const status =
        triage.score >= TRIAGE_THRESHOLD
          ? SocialHuntStatus.QUALIFIED
          : SocialHuntStatus.SKIPPED;

      const lead = await prisma.socialHuntLead.create({
        data: {
          agentId,
          targetCastHash: cast.hash,
          targetFid: cast.authorFid,
          targetUsername: cast.authorUsername,
          targetText: cast.text,
          channel: cast.channel,
          status,
          triageScore: triage.score,
          triageReason: triage.reason,
          suggestedPitch: triage.pitch,
          offeringSlug: triage.matchedOffering,
          triagedAt: new Date(),
        },
      });

      if (status === SocialHuntStatus.QUALIFIED) {
        qualifiedLeads.push({
          cast,
          leadId: lead.id,
          pitch: triage.pitch,
          score: triage.score,
        });
      }

      log.debug(
        { castHash: cast.hash, score: triage.score, status },
        'Brain: triage complete',
      );
    } catch (err) {
      log.warn(
        { castHash: cast.hash, error: (err as Error).message },
        'Brain: triage failed',
      );
    }
  }

  return qualifiedLeads;
}

// ── 3. THE MOUTH ─────────────────────────────────────────────────────────

/**
 * Reply to qualified leads, respecting hourly + daily rate limits.
 *
 * Returns the number of replies successfully sent.
 */
async function engageLeads(
  qualifiedLeads: QualifiedLead[],
  agentId: string,
  signerUuid: string,
  prisma: PrismaClient,
  neynar: NeynarClient,
  log: pino.Logger,
): Promise<number> {
  if (qualifiedLeads.length === 0) return 0;

  // Check hourly + daily rate limits from DB
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [hourlyCount, dailyCount] = await Promise.all([
    prisma.socialHuntLead.count({
      where: {
        agentId,
        status: SocialHuntStatus.REPLIED,
        repliedAt: { gte: oneHourAgo },
      },
    }),
    prisma.socialHuntLead.count({
      where: {
        agentId,
        status: SocialHuntStatus.REPLIED,
        repliedAt: { gte: oneDayAgo },
      },
    }),
  ]);

  let remainingHourly = MAX_REPLIES_PER_HOUR - hourlyCount;
  let remainingDaily = MAX_REPLIES_PER_DAY - dailyCount;
  let repliesSent = 0;

  for (const { cast, leadId, pitch, score } of qualifiedLeads) {
    if (remainingHourly <= 0 || remainingDaily <= 0) {
      log.info(
        { remainingHourly, remainingDaily },
        'Mouth: rate limit reached, deferring remaining leads',
      );
      break;
    }

    try {
      const replyResult = await neynar.replyCast(
        signerUuid,
        cast.hash,
        pitch,
      );

      await prisma.socialHuntLead.update({
        where: { id: leadId },
        data: {
          status: SocialHuntStatus.REPLIED,
          replyCastHash: replyResult.hash ?? null,
          pitchText: pitch,
          repliedAt: new Date(),
        },
      });

      repliesSent++;
      remainingHourly--;
      remainingDaily--;

      log.info(
        { castHash: cast.hash, targetUser: cast.authorUsername, score },
        'Mouth: reply sent',
      );
    } catch (err) {
      await prisma.socialHuntLead.update({
        where: { id: leadId },
        data: { status: SocialHuntStatus.FAILED },
      });
      log.error(
        { castHash: cast.hash, error: (err as Error).message },
        'Mouth: reply failed',
      );
    }
  }

  return repliesSent;
}

// ── Scheduling Helper ────────────────────────────────────────────────────

/**
 * Schedule a repeatable hunt job for all eligible agents.
 *
 * Called during runtime bootstrap. Each agent with active offerings
 * and Trinity prerequisites gets a repeatable polling job.
 */
export async function scheduleSocialHunter(
  queue: Queue,
  prisma: PrismaClient,
): Promise<void> {
  const agents = await prisma.agent.findMany({
    where: {
      status: 'ACTIVE',
      fid: { not: null },
      signerUuid: { not: null },
      sellerOfferings: { some: { status: 'ACTIVE' } },
    },
    select: { id: true, name: true },
  });

  for (const agent of agents) {
    await queue.add(
      `hunt-${agent.id}`,
      { agentId: agent.id },
      {
        repeat: { every: POLL_INTERVAL_MS },
        jobId: `social-hunter-${agent.id}`, // Idempotent: same ID = no duplicates
        removeOnComplete: 50,
        removeOnFail: 25,
      },
    );
  }

  rootLogger.info(
    { agentCount: agents.length, pollIntervalMs: POLL_INTERVAL_MS },
    'Social Hunter jobs scheduled',
  );
}
