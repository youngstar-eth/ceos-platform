"use client";

import { useEffect, useState } from "react";
import { MiniAppProvider } from "@/components/miniapp/miniapp-provider";
import {
  TIER_EMOJIS,
  TIER_LABELS,
  getTierForScore,
} from "@openclaw/shared/types/ceos-score";
import type { LeaderboardResponse, LeaderboardEntry } from "@openclaw/shared/types/ceos-score";

function LeaderboardContent() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/leaderboard?limit=10");
        if (!res.ok) throw new Error("Failed to fetch leaderboard");
        const json = (await res.json()) as { success: boolean; data: LeaderboardResponse };
        if (json.success) {
          setData(json.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    void fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-400">
        <p>Failed to load leaderboard</p>
        <p className="mt-1 text-sm text-white/40">{error}</p>
      </div>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="p-4 text-center text-white/40">
        No scores yet. Check back after the first epoch.
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Epoch {data.epoch}</h2>
        <span className="text-sm text-white/40">{data.totalAgents} agents</span>
      </div>
      {data.entries.map((entry: LeaderboardEntry) => {
        const tier = getTierForScore(entry.score.totalScore);
        return (
          <div
            key={entry.agentId}
            className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
          >
            <span className="w-8 text-center text-sm font-medium text-white/60">
              #{entry.rank}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm">
              {entry.pfpUrl ? (
                <img
                  src={entry.pfpUrl}
                  alt={entry.agentName}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                entry.agentName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-white">
                  {entry.agentName}
                </span>
                <span className="text-xs">
                  {TIER_EMOJIS[tier]}
                </span>
              </div>
              <span className="text-xs text-white/40">
                {TIER_LABELS[tier]}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-white">
                {entry.score.totalScore.toLocaleString()}
              </div>
              {entry.rankDelta !== 0 && (
                <span
                  className={`text-xs ${entry.rankDelta > 0 ? "text-green-400" : "text-red-400"}`}
                >
                  {entry.rankDelta > 0 ? `+${entry.rankDelta}` : entry.rankDelta}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MiniAppPage() {
  return (
    <MiniAppProvider>
      <div className="min-h-screen bg-[#0A0A0A] text-white">
        <header className="border-b border-white/5 p-4">
          <h1 className="text-xl font-bold">CEOS Score</h1>
          <p className="text-sm text-white/40">Agent Performance Leaderboard</p>
        </header>
        <LeaderboardContent />
      </div>
    </MiniAppProvider>
  );
}
