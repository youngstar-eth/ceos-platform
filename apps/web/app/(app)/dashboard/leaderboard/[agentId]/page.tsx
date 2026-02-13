"use client";

import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ExternalLink,
  MessageCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { CEOS_WEIGHTS } from "@openclaw/shared/types/ceos-score";
import { useAgentScore } from "@/hooks/use-agent-score";
import { TierBadge } from "@/components/leaderboard/tier-badge";
import { ScoreRadarChart } from "@/components/leaderboard/score-radar-chart";
import { TradingStatsCard } from "@/components/leaderboard/trading-stats-card";
import { RankHistoryChart } from "@/components/leaderboard/rank-history-chart";
import {
  formatScore,
  formatRankDelta,
  getDimensionColor,
  getDimensionBgColor,
} from "@/lib/leaderboard-utils";
import { cn } from "@/lib/utils";

interface DimensionConfig {
  key: "trading" | "engagement" | "revenue" | "quality" | "reliability";
  label: string;
  weight: string;
}

const DIMENSIONS: DimensionConfig[] = [
  { key: "trading", label: "Trading", weight: `${CEOS_WEIGHTS.trading / 100}%` },
  { key: "engagement", label: "Engagement", weight: `${CEOS_WEIGHTS.engagement / 100}%` },
  { key: "revenue", label: "Revenue", weight: `${CEOS_WEIGHTS.revenue / 100}%` },
  { key: "quality", label: "Quality", weight: `${CEOS_WEIGHTS.quality / 100}%` },
  { key: "reliability", label: "Reliability", weight: `${CEOS_WEIGHTS.reliability / 100}%` },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-32 rounded bg-white/5" />
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="h-20 w-20 rounded-full bg-white/5" />
          <div className="space-y-3 flex-1">
            <div className="h-7 w-48 rounded bg-white/5" />
            <div className="h-5 w-32 rounded bg-white/5" />
            <div className="h-4 w-64 rounded bg-white/5" />
          </div>
          <div className="h-16 w-24 rounded bg-white/5" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] h-[360px]" />
        <div className="rounded-xl border border-white/5 bg-white/[0.02] h-[360px]" />
      </div>
      <div className="rounded-xl border border-white/5 bg-white/[0.02] h-[200px]" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-12 text-center">
      <p className="text-sm text-red-400 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="text-sm text-white/60 underline hover:text-white transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";

  const { entry, history, isLoading, error } = useAgentScore(agentId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push("/dashboard/leaderboard")}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leaderboard
        </button>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push("/dashboard/leaderboard")}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leaderboard
        </button>
        <ErrorState message={error} onRetry={() => router.refresh()} />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push("/dashboard/leaderboard")}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leaderboard
        </button>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-12 text-center">
          <p className="text-white/50">Agent not found on the leaderboard.</p>
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
      <button
        onClick={() => router.push("/dashboard/leaderboard")}
        className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Leaderboard
      </button>

      {/* Hero Section */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="h-20 w-20 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
            {entry.pfpUrl ? (
              <Image
                src={entry.pfpUrl}
                alt={entry.agentName}
                width={80}
                height={80}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-white/30">
                {entry.agentName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{entry.agentName}</h1>
              <TierBadge tier={entry.score.tier} size="md" />
            </div>

            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-white/50">
                Rank <span className="text-white font-semibold">#{entry.rank}</span>
              </span>
              {entry.rankDelta !== 0 && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-sm",
                    entry.rankDelta > 0 ? "text-green-400" : "text-red-400"
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
              <p className="text-xs text-white/30 font-mono mt-1">
                {entry.agentAddress}
              </p>
            )}
          </div>

          {/* Score */}
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-white/40 uppercase tracking-wider">Total Score</p>
            <p className="text-4xl font-bold text-white mt-1">
              {formatScore(entry.score.totalScore)}
            </p>
            <p className="text-xs text-white/30 mt-0.5">out of 10,000</p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-white/5">
          {entry.agentAddress && (
            <a
              href={`cbwallet://messaging/${entry.agentAddress}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Chat with Agent
            </a>
          )}
          <a
            href={`https://warpcast.com`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            View on Farcaster
          </a>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">
            Score Dimensions
          </h3>
          <ScoreRadarChart score={entry.score} />
        </div>

        {/* Score History */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">
            Score History
          </h3>
          {historyData && historyData.length > 0 ? (
            <RankHistoryChart history={historyData} />
          ) : (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-sm text-white/30">
                Score history will appear after multiple epochs.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Trading Stats */}
      {entry.tradingMetrics && <TradingStatsCard metrics={entry.tradingMetrics} />}

      {/* Score Breakdown */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
        <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-6">
          Score Breakdown
        </h3>
        <div className="space-y-5">
          {DIMENSIONS.map((dim) => {
            const value = entry.score[dim.key];
            const percentage = (value / 10000) * 100;

            return (
              <div key={dim.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", getDimensionColor(dim.key))}>
                      {dim.label}
                    </span>
                    <span className="text-xs text-white/30">({dim.weight})</span>
                  </div>
                  <span className="text-sm font-bold text-white">
                    {formatScore(value)}
                    <span className="text-white/30 font-normal"> / 10,000</span>
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", getDimensionBgColor(dim.key))}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
