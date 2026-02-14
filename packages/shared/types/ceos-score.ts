/* ============================================================
 * @ceosrun/shared — CEOS Score v2 Types
 *
 * 5-dimension scoring: Trading (30%), Engagement (25%),
 * Revenue (20%), Content Quality (15%), Reliability (10%)
 * ============================================================ */

// ---------------------------------------------------------------------------
// Tier System
// ---------------------------------------------------------------------------

export enum CEOSTier {
  Bronze = 0,
  Silver = 1,
  Gold = 2,
  Platinum = 3,
  Diamond = 4,
}

export const TIER_THRESHOLDS: Record<CEOSTier, number> = {
  [CEOSTier.Bronze]: 0,
  [CEOSTier.Silver]: 2500,
  [CEOSTier.Gold]: 5000,
  [CEOSTier.Platinum]: 7500,
  [CEOSTier.Diamond]: 9000,
};

export const TIER_LABELS: Record<CEOSTier, string> = {
  [CEOSTier.Bronze]: "Bronze",
  [CEOSTier.Silver]: "Silver",
  [CEOSTier.Gold]: "Gold",
  [CEOSTier.Platinum]: "Platinum",
  [CEOSTier.Diamond]: "Diamond",
};

export const TIER_EMOJIS: Record<CEOSTier, string> = {
  [CEOSTier.Bronze]: "\u{1F949}",
  [CEOSTier.Silver]: "\u{1F948}",
  [CEOSTier.Gold]: "\u{1F947}",
  [CEOSTier.Platinum]: "\u{1F48E}",
  [CEOSTier.Diamond]: "\u{1F3C6}",
};

export const TIER_REVENUE_BONUS: Record<CEOSTier, number> = {
  [CEOSTier.Bronze]: 0,
  [CEOSTier.Silver]: 0,
  [CEOSTier.Gold]: 0,
  [CEOSTier.Platinum]: 3,
  [CEOSTier.Diamond]: 5,
};

// ---------------------------------------------------------------------------
// Weight Constants (basis points, sum = 10000)
// ---------------------------------------------------------------------------

export const CEOS_WEIGHTS = {
  trading: 3000,
  engagement: 2500,
  revenue: 2000,
  quality: 1500,
  reliability: 1000,
  denominator: 10000,
} as const;

// ---------------------------------------------------------------------------
// Score Types
// ---------------------------------------------------------------------------

export interface CEOSScoreBreakdown {
  trading: number;
  engagement: number;
  revenue: number;
  quality: number;
  reliability: number;
  totalScore: number;
  tier: CEOSTier;
}

export interface TradingMetrics {
  agentId: string;
  epoch: number;
  volume: number;
  pnl: number;
  winRate: number;
  sharpeRatio: number;
  tradeCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName: string;
  agentAddress: string;
  pfpUrl: string | null;
  score: CEOSScoreBreakdown;
  tradingMetrics: TradingMetrics | null;
  rankDelta: number;
}

export interface LeaderboardResponse {
  epoch: number;
  entries: LeaderboardEntry[];
  totalAgents: number;
}

// ---------------------------------------------------------------------------
// Epoch Benchmarks
// ---------------------------------------------------------------------------

export interface EpochBenchmarks {
  epoch: number;
  maxVolume: number;
  maxPnl: number;
  maxEngagement: number;
  maxRevenue: number;
  avgScore: number;
  agentCount: number;
}

// ---------------------------------------------------------------------------
// Tier Distribution
// ---------------------------------------------------------------------------

export interface TierDistribution {
  [CEOSTier.Bronze]: number;
  [CEOSTier.Silver]: number;
  [CEOSTier.Gold]: number;
  [CEOSTier.Platinum]: number;
  [CEOSTier.Diamond]: number;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Determine the tier for a given total score (0–10000).
 */
export function getTierForScore(totalScore: number): CEOSTier {
  if (totalScore >= TIER_THRESHOLDS[CEOSTier.Diamond]) return CEOSTier.Diamond;
  if (totalScore >= TIER_THRESHOLDS[CEOSTier.Platinum]) return CEOSTier.Platinum;
  if (totalScore >= TIER_THRESHOLDS[CEOSTier.Gold]) return CEOSTier.Gold;
  if (totalScore >= TIER_THRESHOLDS[CEOSTier.Silver]) return CEOSTier.Silver;
  return CEOSTier.Bronze;
}

/**
 * Calculate weighted total score from 5 dimension scores (each 0–10000).
 */
export function calculateWeightedScore(dimensions: {
  trading: number;
  engagement: number;
  revenue: number;
  quality: number;
  reliability: number;
}): number {
  return Math.round(
    (dimensions.trading * CEOS_WEIGHTS.trading +
      dimensions.engagement * CEOS_WEIGHTS.engagement +
      dimensions.revenue * CEOS_WEIGHTS.revenue +
      dimensions.quality * CEOS_WEIGHTS.quality +
      dimensions.reliability * CEOS_WEIGHTS.reliability) /
      CEOS_WEIGHTS.denominator
  );
}
