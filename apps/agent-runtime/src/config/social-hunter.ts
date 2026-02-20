/**
 * Social Hunter Configuration
 *
 * Maps service categories to Farcaster channels where potential
 * buyers discuss problems our agents can solve. All tunable
 * constants for the Ear → Brain → Mouth pipeline live here.
 */

// ── Channel Mapping ──────────────────────────────────────────────────────

/** Farcaster channels where each service category's buyers congregate. */
export const CATEGORY_CHANNELS: Record<string, string[]> = {
  content: ['ai', 'writing', 'marketing', 'content-creators', 'copywriting'],
  analysis: ['data', 'ai', 'crypto', 'defi', 'trading'],
  trading: ['trading', 'defi', 'crypto', 'base', 'onchain'],
  engagement: ['marketing', 'growth', 'farcaster', 'social'],
  networking: ['networking', 'founders', 'startups', 'web3', 'base'],
};

/** Keywords to search across all channels (supplements channel feeds). */
export const HUNT_KEYWORDS = [
  'need an AI agent',
  'looking for AI',
  'anyone know an agent',
  'hire an agent',
  'AI assistant for',
  'automate my',
  'need help with trading',
  'content creation AI',
  'looking for a bot',
  'who can build',
];

// ── Rate Limits ──────────────────────────────────────────────────────────

/** Maximum replies per agent per hour. */
export const MAX_REPLIES_PER_HOUR = 5;

/** Maximum replies per agent per day. */
export const MAX_REPLIES_PER_DAY = 20;

/** Cooldown period before re-engaging the same user (ms). */
export const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Minimum triage score (1-10) to qualify as a lead. */
export const TRIAGE_THRESHOLD = 7;

// ── Worker Timing ────────────────────────────────────────────────────────

/** How often the hunter polls for new casts (ms). */
export const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Max casts to process per polling cycle per agent. */
export const MAX_CASTS_PER_CYCLE = 20;

/** Max channels to scan per cycle (rotate through rest). */
export const MAX_CHANNELS_PER_CYCLE = 3;

// ── LLM ──────────────────────────────────────────────────────────────────

/** Model for triage (fast, cheap). */
export const TRIAGE_MODEL = 'anthropic/claude-sonnet-4';

/** Max tokens for triage response. */
export const TRIAGE_MAX_TOKENS = 300;

/** Max characters for the generated pitch reply. */
export const MAX_PITCH_LENGTH = 320;

// ── Redis Keys ───────────────────────────────────────────────────────────

/** Redis SET key template for tracking seen cast hashes per agent. */
export const SEEN_CASTS_KEY = (agentId: string) =>
  `social-hunter:seen:${agentId}`;

/** TTL for the seen-casts Redis SET (seconds). */
export const SEEN_CASTS_TTL_SECONDS = 48 * 60 * 60; // 48 hours
