'use client';

import { TrendingUp, DollarSign, Target, BarChart3, Hash } from 'lucide-react';
import type { TradingMetrics } from '@openclaw/shared/types/ceos-score';
import { formatVolume, formatPnl, formatWinRate } from '@/lib/leaderboard-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TradingStatsCardProps {
  metrics: TradingMetrics;
}

interface StatItem {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  iconBgClass: string;
}

export function TradingStatsCard({ metrics }: TradingStatsCardProps) {
  const stats: StatItem[] = [
    {
      label: 'Volume',
      value: formatVolume(metrics.volume),
      icon: DollarSign,
      colorClass: 'text-neon-mint',
      iconBgClass: 'bg-neon-mint/10 border-neon-mint/20',
    },
    {
      label: 'PNL',
      value: formatPnl(metrics.pnl),
      icon: TrendingUp,
      colorClass: metrics.pnl >= 0 ? 'text-neon-mint' : 'text-neon-pink',
      iconBgClass: metrics.pnl >= 0
        ? 'bg-neon-mint/10 border-neon-mint/20'
        : 'bg-neon-pink/10 border-neon-pink/20',
    },
    {
      label: 'Win Rate',
      value: formatWinRate(metrics.winRate),
      icon: Target,
      colorClass: 'text-neon-cyan',
      iconBgClass: 'bg-neon-cyan/10 border-neon-cyan/20',
    },
    {
      label: 'Sharpe Ratio',
      value: metrics.sharpeRatio.toFixed(2),
      icon: BarChart3,
      colorClass: 'text-neon-purple',
      iconBgClass: 'bg-neon-purple/10 border-neon-purple/20',
    },
    {
      label: 'Trade Count',
      value: String(metrics.tradeCount),
      icon: Hash,
      colorClass: 'text-neon-yellow',
      iconBgClass: 'bg-neon-yellow/10 border-neon-yellow/20',
    },
  ];

  return (
    <Card className="glass-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-rajdhani font-semibold">
              Trading Performance
            </CardTitle>
            <span className="text-[8px] text-vapor-lavender/25 font-pixel">
              トレーディング
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="group rounded-lg border border-border/40 bg-card/30 p-3 transition-all hover:border-neon-purple/30 hover:bg-neon-purple/5"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  'h-7 w-7 rounded-md border flex items-center justify-center transition-all group-hover:scale-105',
                  stat.iconBgClass,
                )}>
                  <stat.icon className={cn('h-3.5 w-3.5', stat.colorClass)} />
                </div>
                <span className="text-[11px] text-muted-foreground font-rajdhani uppercase tracking-wider">
                  {stat.label}
                </span>
              </div>
              <p className={cn('text-lg font-bold font-rajdhani', stat.colorClass)}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
