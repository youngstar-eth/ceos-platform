/* ============================================================
 * XMTP Chat Agent — Message Formatter
 *
 * Text-based formatters for leaderboard data.
 * All outputs respect the 1000-char XMTP message limit.
 * ============================================================ */

import {
  type LeaderboardEntry,
  type TradingMetrics,
  TIER_EMOJIS,
  TIER_LABELS,
  CEOS_WEIGHTS,
} from "@ceosrun/shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a text-based progress bar.
 * @param value  - Current value (0-10000 basis points)
 * @param max    - Maximum value (default 10000)
 * @param width  - Bar width in characters (default 10)
 */
function progressBar(value: number, max: number = 10000, width: number = 10): string {
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${((ratio * 100).toFixed(1))}%`;
}

/**
 * Format a rank delta as a visual indicator.
 */
function rankDeltaIndicator(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "=";
}

/**
 * Truncate a string to respect the XMTP message limit.
 */
function truncate(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  return text.slice(0, MAX_MESSAGE_LENGTH - 3) + "...";
}

/**
 * Format a number with commas for readability.
 */
function formatNumber(num: number): string {
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toFixed(2);
}

// ---------------------------------------------------------------------------
// Public Formatters
// ---------------------------------------------------------------------------

/**
 * Format leaderboard entries as a ranked text list.
 */
export function formatLeaderboard(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return "No agents found on the leaderboard yet.";
  }

  const header = "CEOS Score Leaderboard\n" + "=".repeat(24) + "\n\n";

  const lines: string[] = [];
  for (const entry of entries) {
    const tierEmoji = TIER_EMOJIS[entry.score.tier];
    const delta = rankDeltaIndicator(entry.rankDelta);
    const score = (entry.score.totalScore / 100).toFixed(1);
    const line = `#${entry.rank} ${tierEmoji} ${entry.agentName} - ${score}pts (${delta})`;
    lines.push(line);
  }

  const body = lines.join("\n");
  const footer = `\n\nTotal agents: ${entries.length} | Type "score @name" for details`;

  return truncate(header + body + footer);
}

/**
 * Format a detailed score breakdown for a single agent.
 */
export function formatScoreBreakdown(entry: LeaderboardEntry): string {
  const { score } = entry;
  const tierEmoji = TIER_EMOJIS[score.tier];
  const tierLabel = TIER_LABELS[score.tier];
  const totalPts = (score.totalScore / 100).toFixed(1);

  const header =
    `${tierEmoji} ${entry.agentName} — ${tierLabel} Tier\n` +
    `Rank: #${entry.rank} (${rankDeltaIndicator(entry.rankDelta)}) | Score: ${totalPts}/100\n` +
    "-".repeat(30) + "\n";

  const dimensions: Array<{ label: string; value: number; weight: number }> = [
    { label: "Trading", value: score.trading, weight: CEOS_WEIGHTS.trading },
    { label: "Engagement", value: score.engagement, weight: CEOS_WEIGHTS.engagement },
    { label: "Revenue", value: score.revenue, weight: CEOS_WEIGHTS.revenue },
    { label: "Quality", value: score.quality, weight: CEOS_WEIGHTS.quality },
    { label: "Reliability", value: score.reliability, weight: CEOS_WEIGHTS.reliability },
  ];

  const dimLines = dimensions.map((d) => {
    const pct = (d.weight / CEOS_WEIGHTS.denominator * 100).toFixed(0);
    const bar = progressBar(d.value, 10000, 8);
    return `${d.label.padEnd(12)} ${bar} (${pct}% weight)`;
  });

  const body = dimLines.join("\n");
  const footer = `\n\nAddress: ${entry.agentAddress.slice(0, 6)}...${entry.agentAddress.slice(-4)}`;

  return truncate(header + body + footer);
}

/**
 * Format trading-specific statistics for an agent.
 */
export function formatTradingStats(metrics: TradingMetrics): string {
  const header = `Trading Stats (Epoch ${metrics.epoch})\n` + "-".repeat(28) + "\n";

  const lines = [
    `Volume:      $${formatNumber(metrics.volume)}`,
    `PnL:         $${formatNumber(metrics.pnl)} ${metrics.pnl >= 0 ? "+" : ""}`,
    `Win Rate:    ${(metrics.winRate * 100).toFixed(1)}%`,
    `Sharpe:      ${metrics.sharpeRatio.toFixed(2)}`,
    `Trades:      ${metrics.tradeCount}`,
  ];

  return truncate(header + lines.join("\n"));
}

/**
 * Format a list of entries for trading-focused display.
 */
export function formatTradingLeaderboard(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return "No trading data available yet.";
  }

  const header = "Top Traders\n" + "=".repeat(16) + "\n\n";

  const lines: string[] = [];
  for (const entry of entries) {
    const tm = entry.tradingMetrics;
    const tierEmoji = TIER_EMOJIS[entry.score.tier];

    if (tm) {
      const vol = formatNumber(tm.volume);
      const pnl = formatNumber(tm.pnl);
      const wr = (tm.winRate * 100).toFixed(0);
      const line = `#${entry.rank} ${tierEmoji} ${entry.agentName} | Vol: $${vol} | PnL: $${pnl} | WR: ${wr}%`;
      lines.push(line);
    } else {
      lines.push(`#${entry.rank} ${tierEmoji} ${entry.agentName} | No trading data`);
    }
  }

  const body = lines.join("\n");
  return truncate(header + body);
}
