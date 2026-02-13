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
 * Format a percentage value for display (0-100).
 * e.g. 67.5 -> "67.5%"
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format ETH value for display.
 * e.g. 1.2345 -> "1.2345 ETH"
 */
export function formatEthValue(value: number, decimals = 4): string {
  return `${value.toFixed(decimals)} ETH`;
}

/**
 * Format USDC value for display.
 * e.g. 1234.56 -> "$1,234.56"
 */
export function formatUsdcValue(value: number, decimals = 2): string {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)}`;
}

/**
 * Return a tailwind text color class for each scoring dimension (Vaporwave neon palette).
 */
export function getDimensionColor(dimension: string): string {
  const colors: Record<string, string> = {
    trading: "text-neon-cyan",
    engagement: "text-neon-pink",
    revenue: "text-neon-mint",
    quality: "text-neon-yellow",
    reliability: "text-neon-purple",
  };
  return colors[dimension] ?? "text-foreground";
}

/**
 * Return a tailwind background color class for each scoring dimension (Vaporwave neon palette).
 */
export function getDimensionBgColor(dimension: string): string {
  const colors: Record<string, string> = {
    trading: "bg-neon-cyan",
    engagement: "bg-neon-pink",
    revenue: "bg-neon-mint",
    quality: "bg-neon-yellow",
    reliability: "bg-neon-purple",
  };
  return colors[dimension] ?? "bg-foreground";
}

/**
 * Return a neon gradient CSS string for each scoring dimension bar fill.
 */
export function getDimensionGradient(dimension: string): string {
  const gradients: Record<string, string> = {
    trading: "linear-gradient(90deg, #01cdfe 0%, #94d0ff 100%)",
    engagement: "linear-gradient(90deg, #ff71ce 0%, #ff6ad5 100%)",
    revenue: "linear-gradient(90deg, #05ffa1 0%, #8affc1 100%)",
    quality: "linear-gradient(90deg, #ffd319 0%, #ff6b35 100%)",
    reliability: "linear-gradient(90deg, #b967ff 0%, #c774e8 100%)",
  };
  return gradients[dimension] ?? "linear-gradient(90deg, #b967ff 0%, #01cdfe 100%)";
}

/**
 * Return a tailwind text color class for each tier (Vaporwave palette).
 */
export function getTierColor(tier: CEOSTier): string {
  const colors: Record<CEOSTier, string> = {
    [CEOSTier.Bronze]: "text-sunset-orange",
    [CEOSTier.Silver]: "text-chrome-light",
    [CEOSTier.Gold]: "text-neon-yellow",
    [CEOSTier.Platinum]: "text-neon-cyan",
    [CEOSTier.Diamond]: "text-neon-purple",
  };
  return colors[tier] ?? "text-foreground";
}

/**
 * Return a tailwind border color class for each tier (Vaporwave palette).
 */
export function getTierBorderColor(tier: CEOSTier): string {
  const colors: Record<CEOSTier, string> = {
    [CEOSTier.Bronze]: "border-sunset-orange/30",
    [CEOSTier.Silver]: "border-chrome-light/30",
    [CEOSTier.Gold]: "border-neon-yellow/30",
    [CEOSTier.Platinum]: "border-neon-cyan/30",
    [CEOSTier.Diamond]: "border-neon-purple/30",
  };
  return colors[tier] ?? "border-border";
}

/**
 * Return a tailwind background color class for each tier (subtle, Vaporwave palette).
 */
export function getTierBgColor(tier: CEOSTier): string {
  const colors: Record<CEOSTier, string> = {
    [CEOSTier.Bronze]: "bg-sunset-orange/10",
    [CEOSTier.Silver]: "bg-chrome-light/10",
    [CEOSTier.Gold]: "bg-neon-yellow/10",
    [CEOSTier.Platinum]: "bg-neon-cyan/10",
    [CEOSTier.Diamond]: "bg-neon-purple/10",
  };
  return colors[tier] ?? "bg-muted";
}

/**
 * Return a CSS neon glow box-shadow for each tier.
 */
export function getTierGlow(tier: CEOSTier): string {
  const glows: Record<CEOSTier, string> = {
    [CEOSTier.Bronze]: "0 0 8px rgba(255, 107, 53, 0.3)",
    [CEOSTier.Silver]: "0 0 8px rgba(232, 232, 232, 0.3)",
    [CEOSTier.Gold]: "0 0 8px rgba(255, 211, 25, 0.4)",
    [CEOSTier.Platinum]: "0 0 10px rgba(1, 205, 254, 0.4)",
    [CEOSTier.Diamond]: "0 0 12px rgba(185, 103, 255, 0.5), 0 0 24px rgba(255, 113, 206, 0.2)",
  };
  return glows[tier] ?? "none";
}
