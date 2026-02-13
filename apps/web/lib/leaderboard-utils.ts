import { CEOSTier } from "@openclaw/shared/types/ceos-score";

/**
 * Format a score number with comma separators.
 * e.g. 8542 -> "8,542"
 */
export function formatScore(score: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(score));
}

/**
 * Format a volume value as a compact dollar string.
 * e.g. 1_200_000 -> "$1.2M", 450_000 -> "$450K", 500 -> "$500"
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    const millions = volume / 1_000_000;
    return `$${millions.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (volume >= 1_000) {
    const thousands = volume / 1_000;
    return `$${thousands.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `$${Math.round(volume)}`;
}

/**
 * Format a PNL value with sign and dollar symbol.
 * e.g. 12450 -> "+$12,450", -3200 -> "-$3,200"
 */
export function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "-";
  const formatted = new Intl.NumberFormat("en-US").format(Math.abs(Math.round(pnl)));
  return `${sign}$${formatted}`;
}

/**
 * Format a win rate from 0-1 decimal to percentage string.
 * e.g. 0.675 -> "67.5%"
 */
export function formatWinRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Format a rank delta as a signed string.
 * e.g. 5 -> "+5", -3 -> "-3", 0 -> "0"
 */
export function formatRankDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

/**
 * Return a tailwind text color class for each scoring dimension.
 */
export function getDimensionColor(dimension: string): string {
  const colors: Record<string, string> = {
    trading: "text-blue-400",
    engagement: "text-pink-400",
    revenue: "text-green-400",
    quality: "text-yellow-400",
    reliability: "text-purple-400",
  };
  return colors[dimension] ?? "text-white";
}

/**
 * Return a tailwind background color class for each scoring dimension (for bars).
 */
export function getDimensionBgColor(dimension: string): string {
  const colors: Record<string, string> = {
    trading: "bg-blue-400",
    engagement: "bg-pink-400",
    revenue: "bg-green-400",
    quality: "bg-yellow-400",
    reliability: "bg-purple-400",
  };
  return colors[dimension] ?? "bg-white";
}

/**
 * Return a tailwind text color class for each tier.
 */
export function getTierColor(tier: CEOSTier): string {
  const colors: Record<CEOSTier, string> = {
    [CEOSTier.Bronze]: "text-amber-600",
    [CEOSTier.Silver]: "text-gray-400",
    [CEOSTier.Gold]: "text-yellow-400",
    [CEOSTier.Platinum]: "text-cyan-300",
    [CEOSTier.Diamond]: "text-violet-400",
  };
  return colors[tier];
}

/**
 * Return a tailwind border color class for each tier.
 */
export function getTierBorderColor(tier: CEOSTier): string {
  const colors: Record<CEOSTier, string> = {
    [CEOSTier.Bronze]: "border-amber-600/30",
    [CEOSTier.Silver]: "border-gray-400/30",
    [CEOSTier.Gold]: "border-yellow-400/30",
    [CEOSTier.Platinum]: "border-cyan-300/30",
    [CEOSTier.Diamond]: "border-violet-400/30",
  };
  return colors[tier];
}

/**
 * Return a tailwind background color class for each tier (subtle).
 */
export function getTierBgColor(tier: CEOSTier): string {
  const colors: Record<CEOSTier, string> = {
    [CEOSTier.Bronze]: "bg-amber-600/10",
    [CEOSTier.Silver]: "bg-gray-400/10",
    [CEOSTier.Gold]: "bg-yellow-400/10",
    [CEOSTier.Platinum]: "bg-cyan-300/10",
    [CEOSTier.Diamond]: "bg-violet-400/10",
  };
  return colors[tier];
}
