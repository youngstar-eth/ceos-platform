/**
 * Reputation Calculator — Asymmetric Scoring for Sovereign Agents
 *
 * This module implements the Data Moat's reputation scoring algorithm.
 * It's deliberately asymmetric: failures hurt more than successes help.
 * This ensures that agents can't "grind" reputation through volume —
 * they must genuinely be reliable to maintain high scores.
 *
 * Scoring Rules:
 *   - Success: +10 points (base)
 *   - Failure: -15 points (base) — 50% harsher than success reward
 *   - Latency bonus: +5 points if execution < 50% of max latency
 *   - Score range: [0, 10000] (clamped)
 *
 * The score maps to ERC-8004's reputationScore (uint256) on-chain.
 * Off-chain we store granular per-job deltas; on-chain we only
 * write the aggregate score at epoch boundaries via updateReputation().
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** Base points awarded for a successful job completion */
export const BASE_SUCCESS_DELTA = 10;

/** Base points deducted for a failed/disputed job (asymmetric penalty) */
export const BASE_FAILURE_DELTA = -15;

/** Bonus points for completing a job well under the latency budget */
export const LATENCY_BONUS = 5;

/** Threshold: latency bonus kicks in below this fraction of maxLatencyMs */
export const LATENCY_BONUS_THRESHOLD = 0.5;

/** Minimum reputation score (floor) */
export const MIN_SCORE = 0;

/** Maximum reputation score (ceiling) */
export const MAX_SCORE = 10_000;

/** Default starting reputation for newly registered agents */
export const DEFAULT_STARTING_SCORE = 500;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReputationInput {
  /** The agent's current reputation score (0–10000) */
  currentScore: number;
  /** Whether the job completed successfully */
  isSuccess: boolean;
  /** Actual execution time in milliseconds */
  executionTimeMs: number;
  /** Maximum allowed latency from the ServiceOffering */
  maxLatencyMs: number;
}

export interface ReputationResult {
  /** The new clamped reputation score */
  newScore: number;
  /** The raw delta applied (before clamping) */
  delta: number;
  /** Whether the latency bonus was awarded */
  latencyBonusApplied: boolean;
  /** Human-readable breakdown for logging */
  breakdown: string;
}

// ── Core Algorithm ─────────────────────────────────────────────────────────────

/**
 * Calculate the new reputation score after a job execution.
 *
 * Pure function — no side effects, no database access.
 * This makes it trivially testable and composable.
 */
export function calculateReputation(input: ReputationInput): ReputationResult {
  const { currentScore, isSuccess, executionTimeMs, maxLatencyMs } = input;

  // Start with base delta
  let delta = isSuccess ? BASE_SUCCESS_DELTA : BASE_FAILURE_DELTA;
  let latencyBonusApplied = false;

  // Award latency bonus only on success AND when execution is fast
  if (isSuccess && maxLatencyMs > 0 && executionTimeMs < maxLatencyMs * LATENCY_BONUS_THRESHOLD) {
    delta += LATENCY_BONUS;
    latencyBonusApplied = true;
  }

  // Clamp to valid range
  const newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, currentScore + delta));

  // Build human-readable breakdown for logging
  const parts: string[] = [];
  if (isSuccess) {
    parts.push(`+${BASE_SUCCESS_DELTA} (success)`);
    if (latencyBonusApplied) {
      parts.push(`+${LATENCY_BONUS} (latency bonus: ${executionTimeMs}ms < ${Math.round(maxLatencyMs * LATENCY_BONUS_THRESHOLD)}ms threshold)`);
    }
  } else {
    parts.push(`${BASE_FAILURE_DELTA} (failure)`);
  }

  const breakdown = `${currentScore} → ${newScore} [${parts.join(', ')}]`;

  return {
    newScore,
    delta,
    latencyBonusApplied,
    breakdown,
  };
}

/**
 * Map a numeric reputation score to a human-readable tier.
 *
 * Tiers match the ERC-8004 identity display system:
 *   0–999:   Bronze  (new or unreliable agents)
 *   1000–2999: Silver (establishing track record)
 *   3000–5999: Gold   (consistently reliable)
 *   6000–8999: Platinum (top performers)
 *   9000–10000: Diamond (elite, near-perfect record)
 */
export function getReputationTier(score: number): {
  tier: string;
  level: number;
  label: string;
} {
  if (score >= 9000) return { tier: 'diamond', level: 5, label: 'Diamond' };
  if (score >= 6000) return { tier: 'platinum', level: 4, label: 'Platinum' };
  if (score >= 3000) return { tier: 'gold', level: 3, label: 'Gold' };
  if (score >= 1000) return { tier: 'silver', level: 2, label: 'Silver' };
  return { tier: 'bronze', level: 1, label: 'Bronze' };
}
