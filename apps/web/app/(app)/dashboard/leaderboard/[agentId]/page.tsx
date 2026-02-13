'use client';

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  ExternalLink,
  MessageCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { CEOS_WEIGHTS } from '@openclaw/shared/types/ceos-score';
import { useAgentScore } from '@/hooks/use-agent-score';
import { TierBadge } from '@/components/leaderboard/tier-badge';
import { ScoreRadarChart } from '@/components/leaderboard/score-radar-chart';
import { TradingStatsCard } from '@/components/leaderboard/trading-stats-card';
import { RankHistoryChart } from '@/components/leaderboard/rank-history-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  formatScore,
  formatRankDelta,
  getDimensionColor,
  getDimensionGradient,
} from '@/lib/leaderboard-utils';
import { cn } from '@/lib/utils';

interface DimensionConfig {
  key: 'trading' | 'engagement' | 'revenue' | 'quality' | 'reliability';
  label: string;
  weight: string;
}

const DIMENSIONS: DimensionConfig[] = [
  { key: 'trading', label: 'Trading', weight: `${CEOS_WEIGHTS.trading / 100}%` },
  { key: 'engagement', label: 'Engagement', weight: `${CEOS_WEIGHTS.engagement / 100}%` },
  { key: 'revenue', label: 'Revenue', weight: `${CEOS_WEIGHTS.revenue / 100}%` },
  { key: 'quality', label: 'Quality', weight: `${CEOS_WEIGHTS.quality / 100}%` },
  { key: 'reliability', label: 'Reliability', weight: `${CEOS_WEIGHTS.reliability / 100}%` },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-32 rounded bg-neon-purple/5" />
      <div className="glass-card rounded-xl p-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="h-20 w-20 rounded-full bg-neon-purple/5" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-48 rounded bg-neon-purple/5" />
            <div className="h-5 w-32 rounded bg-neon-purple/5" />
            <div className="h-4 w-64 rounded bg-neon-purple/5" />
          </div>
          <div className="h-16 w-24 rounded bg-neon-purple/5" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl h-[360px]" />
        <div className="glass-card rounded-xl h-[360px]" />
      </div>
      <div className="glass-card rounded-xl h-[200px]" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="glass-card rounded-xl border border-neon-pink/20 p-12 text-center">
      <p className="text-sm text-neon-pink mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="text-sm text-muted-foreground underline hover:text-neon-cyan transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = typeof params.agentId === 'string' ? params.agentId : '';

  const { entry, history, isLoading, error } = useAgentScore(agentId);

  const backButton = (
    <button
      onClick={() => router.push('/dashboard/leaderboard')}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-neon-cyan transition-colors font-rajdhani"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Leaderboard
    </button>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {backButton}
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {backButton}
        <ErrorState message={error} onRetry={() => router.refresh()} />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-6">
        {backButton}
        <div className="glass-card rounded-xl p-12 text-center">
          <p className="text-muted-foreground">Agent not found on the leaderboard.</p>
        </div>
      </div>
    );
  }

  const historyData = history
    ? history.map((h, idx) => ({
        epoch: idx + 1,
        totalScore: h.totalScore,
      }))
    : null;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      {backButton}

      {/* Hero Section */}
      <Card className="glass-card-hover overflow-hidden">
        <div className="absolute inset-0 memphis-dots opacity-30 pointer-events-none" />
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="h-20 w-20 rounded-full bg-neon-purple/10 border-2 border-neon-purple/30 overflow-hidden flex-shrink-0 neon-box-purple">
              {entry.pfpUrl ? (
                <Image
                  src={entry.pfpUrl}
                  alt={entry.agentName}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-neon-purple/60 font-orbitron">
                  {entry.agentName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold font-orbitron vaporwave-gradient-text">
                  {entry.agentName}
                </h1>
                <TierBadge tier={entry.score.tier} size="md" showGlow />
              </div>

              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm text-muted-foreground font-rajdhani">
                  Rank{' '}
                  <span className="text-neon-cyan font-bold">#{entry.rank}</span>
                </span>
                {entry.rankDelta !== 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-sm font-rajdhani font-semibold',
                      entry.rankDelta > 0 ? 'text-neon-mint' : 'text-neon-pink',
                    )}
                  >
                    {entry.rankDelta > 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {formatRankDelta(entry.rankDelta)}
                  </span>
                )}
              </div>

              {entry.agentAddress && (
                <p className="text-xs text-muted-foreground/60 font-mono mt-1">
                  {entry.agentAddress}
                </p>
              )}
            </div>

            {/* Score */}
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-vapor-lavender/50 uppercase tracking-widest font-rajdhani">
                Total Score
              </p>
              <p className="text-4xl font-bold stat-glow vaporwave-gradient-text font-orbitron mt-1">
                {formatScore(entry.score.totalScore)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 font-rajdhani">
                out of 10,000
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-neon-purple/10">
            {entry.agentAddress && (
              <Button variant="outline" asChild>
                <a href={`cbwallet://messaging/${entry.agentAddress}`}>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Chat with Agent
                </a>
              </Button>
            )}
            <Button variant="outline" asChild>
              <a
                href="https://warpcast.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Farcaster
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-rajdhani font-semibold">
                Score Dimensions
              </CardTitle>
              <span className="text-[8px] text-vapor-lavender/25 font-pixel">
                スコア
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ScoreRadarChart score={entry.score} />
          </CardContent>
        </Card>

        {/* Score History */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-rajdhani font-semibold">
                Score History
              </CardTitle>
              <span className="text-[8px] text-vapor-lavender/25 font-pixel">
                履歴
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {historyData && historyData.length > 0 ? (
              <RankHistoryChart history={historyData} />
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Score history will appear after multiple epochs.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trading Stats */}
      {entry.tradingMetrics && <TradingStatsCard metrics={entry.tradingMetrics} />}

      {/* Score Breakdown */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-rajdhani font-semibold">
              Score Breakdown
            </CardTitle>
            <span className="text-[8px] text-vapor-lavender/25 font-pixel">
              内訳
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {DIMENSIONS.map((dim) => {
              const value = entry.score[dim.key];
              const percentage = (value / 10000) * 100;

              return (
                <div key={dim.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-semibold font-rajdhani', getDimensionColor(dim.key))}>
                        {dim.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-rajdhani">
                        ({dim.weight})
                      </span>
                    </div>
                    <span className="text-sm font-bold font-rajdhani vaporwave-gradient-text">
                      {formatScore(value)}
                      <span className="text-muted-foreground font-normal"> / 10,000</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-card/60 border border-border/30 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${percentage}%`,
                        background: getDimensionGradient(dim.key),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
