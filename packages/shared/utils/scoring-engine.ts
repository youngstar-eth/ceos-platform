/* ============================================================
 * @openclaw/shared — CEOS Score v2 Scoring Engine
 *
 * Percentile-based normalization with log-scale and sigmoid
 * transforms for fair scoring across agents.
 * ============================================================ */

import {
  type CEOSScoreBreakdown,
  type EpochBenchmarks,
  CEOSTier,
  CEOS_WEIGHTS,
  getTierForScore,
} from "../types/ceos-score";

// ---------------------------------------------------------------------------
// Normalization Helpers
// ---------------------------------------------------------------------------

/**
 * Percentile rank within a sorted array.
 * Returns 0–10000 (basis points).
 */
export function percentileRank(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return value >= sortedValues[0]! ? 10000 : 0;

  let count = 0;
  for (const v of sortedValues) {
    if (v <= value) count++;
  }
  return Math.round((count / sortedValues.length) * 10000);
}

/**
 * Log-scale normalization: maps a raw value to 0–10000.
 * Useful for highly skewed metrics like volume.
 */
export function logScale(value: number, maxValue: number): number {
  if (maxValue <= 0 || value <= 0) return 0;
  const normalized = Math.log(1 + value) / Math.log(1 + maxValue);
  return Math.round(Math.min(10000, normalized * 10000));
}

/**
 * Sigmoid normalization centered at midpoint.
 * Returns 0–10000.
 */
export function sigmoid(value: number, midpoint: number, steepness: number = 0.5): number {
  const x = (value - midpoint) * steepness;
  const result = 1 / (1 + Math.exp(-x));
  return Math.round(result * 10000);
}

/**
 * Linear normalization: maps value in [0, max] to [0, 10000].
 */
export function linearScale(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0;
  return Math.round(Math.min(10000, Math.max(0, (value / maxValue) * 10000)));
}

// ---------------------------------------------------------------------------
// Dimension Score Calculators
// ---------------------------------------------------------------------------

/**
 * Calculate trading performance score (0–10000).
 * Inputs: volume, pnl, win rate (0-1), sharpe ratio.
 */
export function calculateTradingScore(params: {
  volume: number;
  pnl: number;
  winRate: number;
  sharpeRatio: number;
  benchmarks: { maxVolume: number; maxPnl: number };
}): number {
  const volumeScore = logScale(params.volume, params.benchmarks.maxVolume);
  const pnlScore = params.benchmarks.maxPnl > 0
    ? linearScale(Math.max(0, params.pnl), params.benchmarks.maxPnl)
    : 0;
  const winRateScore = Math.round(params.winRate * 10000);
  const sharpeScore = sigmoid(params.sharpeRatio, 1.5, 2);

  // Sub-weights: volume 30%, PNL 30%, win rate 25%, sharpe 15%
  return Math.round(
    (volumeScore * 3000 + pnlScore * 3000 + winRateScore * 2500 + sharpeScore * 1500) / 10000
  );
}

/**
 * Calculate engagement score (0–10000).
 * Based on likes, recasts, replies, mentions normalized against max.
 */
export function calculateEngagementScore(params: {
  likes: number;
  recasts: number;
  replies: number;
  mentions: number;
  maxEngagement: number;
}): number {
  const total = params.likes + params.recasts * 2 + params.replies * 3 + params.mentions * 2;
  return logScale(total, params.maxEngagement);
}

/**
 * Calculate revenue generation score (0–10000).
 */
export function calculateRevenueScore(params: {
  x402Revenue: number;
  tips: number;
  sponsorship: number;
  maxRevenue: number;
}): number {
  const total = params.x402Revenue + params.tips + params.sponsorship;
  return logScale(total, params.maxRevenue);
}

/**
 * Calculate content quality score (0–10000).
 * Combines AI quality rating, originality, and sentiment.
 */
export function calculateQualityScore(params: {
  aiQuality: number;
  originality: number;
  sentiment: number;
}): number {
  // Each input expected 0–100, convert to 0–10000
  const quality = Math.round(params.aiQuality * 100);
  const originality = Math.round(params.originality * 100);
  const sentiment = Math.round(params.sentiment * 100);

  return Math.round((quality * 4000 + originality * 4000 + sentiment * 2000) / 10000);
}

/**
 * Calculate reliability score (0–10000).
 * Based on uptime percentage, response time, and error rate.
 */
export function calculateReliabilityScore(params: {
  uptimePercent: number;
  avgResponseTimeMs: number;
  errorRate: number;
}): number {
  // Uptime: direct percentage to basis points
  const uptimeScore = Math.round(params.uptimePercent * 100);

  // Response time: lower is better, sigmoid centered at 2000ms
  const responseScore = 10000 - sigmoid(params.avgResponseTimeMs, 2000, 0.003);

  // Error rate: lower is better (0-1 range)
  const errorScore = Math.round((1 - Math.min(1, params.errorRate)) * 10000);

  return Math.round((uptimeScore * 5000 + responseScore * 2500 + errorScore * 2500) / 10000);
}

// ---------------------------------------------------------------------------
// Main Scoring Function
// ---------------------------------------------------------------------------

/**
 * Calculate full CEOS Score breakdown for an agent.
 */
export function calculateCEOSScore(dimensions: {
  trading: number;
  engagement: number;
  revenue: number;
  quality: number;
  reliability: number;
}): CEOSScoreBreakdown {
  const clamped = {
    trading: Math.max(0, Math.min(10000, Math.round(dimensions.trading))),
    engagement: Math.max(0, Math.min(10000, Math.round(dimensions.engagement))),
    revenue: Math.max(0, Math.min(10000, Math.round(dimensions.revenue))),
    quality: Math.max(0, Math.min(10000, Math.round(dimensions.quality))),
    reliability: Math.max(0, Math.min(10000, Math.round(dimensions.reliability))),
  };

  const totalScore = Math.round(
    (clamped.trading * CEOS_WEIGHTS.trading +
      clamped.engagement * CEOS_WEIGHTS.engagement +
      clamped.revenue * CEOS_WEIGHTS.revenue +
      clamped.quality * CEOS_WEIGHTS.quality +
      clamped.reliability * CEOS_WEIGHTS.reliability) /
      CEOS_WEIGHTS.denominator
  );

  return {
    ...clamped,
    totalScore,
    tier: getTierForScore(totalScore),
  };
}

// ---------------------------------------------------------------------------
// Epoch Benchmarks
// ---------------------------------------------------------------------------

/**
 * Calculate benchmarks for an epoch from raw metrics arrays.
 */
export function calculateEpochBenchmarks(
  epoch: number,
  metrics: Array<{
    volume: number;
    pnl: number;
    totalEngagement: number;
    totalRevenue: number;
    totalScore: number;
  }>
): EpochBenchmarks {
  if (metrics.length === 0) {
    return {
      epoch,
      maxVolume: 0,
      maxPnl: 0,
      maxEngagement: 0,
      maxRevenue: 0,
      avgScore: 0,
      agentCount: 0,
    };
  }

  let maxVolume = 0;
  let maxPnl = 0;
  let maxEngagement = 0;
  let maxRevenue = 0;
  let scoreSum = 0;

  for (const m of metrics) {
    if (m.volume > maxVolume) maxVolume = m.volume;
    if (m.pnl > maxPnl) maxPnl = m.pnl;
    if (m.totalEngagement > maxEngagement) maxEngagement = m.totalEngagement;
    if (m.totalRevenue > maxRevenue) maxRevenue = m.totalRevenue;
    scoreSum += m.totalScore;
  }

  return {
    epoch,
    maxVolume,
    maxPnl,
    maxEngagement,
    maxRevenue,
    avgScore: Math.round(scoreSum / metrics.length),
    agentCount: metrics.length,
  };
}
