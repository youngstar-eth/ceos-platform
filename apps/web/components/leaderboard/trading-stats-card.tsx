"use client";

import { TrendingUp, DollarSign, Target, BarChart3, Hash } from "lucide-react";
import type { TradingMetrics } from "@ceosrun/shared/types";
import { formatVolume, formatPnl, formatWinRate } from "@/lib/leaderboard-utils";
import { cn } from "@/lib/utils";

interface TradingStatsCardProps {
  metrics: TradingMetrics;
}

interface StatItem {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

export function TradingStatsCard({ metrics }: TradingStatsCardProps) {
  const stats: StatItem[] = [
    {
      label: "Volume",
      value: formatVolume(metrics.volume),
      icon: DollarSign,
      colorClass: "text-green-400",
    },
    {
      label: "PNL",
      value: formatPnl(metrics.pnl),
      icon: TrendingUp,
      colorClass: metrics.pnl >= 0 ? "text-green-400" : "text-red-400",
    },
    {
      label: "Win Rate",
      value: formatWinRate(metrics.winRate),
      icon: Target,
      colorClass: "text-blue-400",
    },
    {
      label: "Sharpe Ratio",
      value: metrics.sharpeRatio.toFixed(2),
      icon: BarChart3,
      colorClass: "text-purple-400",
    },
    {
      label: "Trade Count",
      value: String(metrics.tradeCount),
      icon: Hash,
      colorClass: "text-yellow-400",
    },
  ];

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
      <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">
        Trading Performance
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <stat.icon className={cn("h-3.5 w-3.5", stat.colorClass)} />
              <span className="text-xs text-white/50">{stat.label}</span>
            </div>
            <p className={cn("text-lg font-semibold", stat.colorClass)}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
