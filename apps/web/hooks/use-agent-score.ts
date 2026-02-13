'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  CEOSScoreBreakdown,
} from '@openclaw/shared/types/ceos-score';

async function fetchAgentEntry(agentId: string): Promise<LeaderboardEntry | null> {
  const res = await fetch(`/api/leaderboard?limit=100&page=1`);
  if (!res.ok) {
    throw new Error(`Failed to fetch leaderboard: ${res.status}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    data: LeaderboardResponse;
    error?: { message: string };
  };

  if (!json.success) {
    throw new Error(json.error?.message ?? 'Unknown error fetching leaderboard');
  }

  const match = json.data.entries.find((e) => e.agentId === agentId);
  return match ?? null;
}

async function fetchScoreHistory(agentId: string): Promise<CEOSScoreBreakdown[] | null> {
  try {
    const res = await fetch(`/api/premium/analytics/agent/${agentId}`);
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      success: boolean;
      data: { history: CEOSScoreBreakdown[] };
    };
    if (!json.success) {
      return null;
    }
    return json.data.history;
  } catch {
    return null;
  }
}

async function fetchAgentData(agentId: string) {
  const [entry, history] = await Promise.all([
    fetchAgentEntry(agentId),
    fetchScoreHistory(agentId),
  ]);
  return { entry, history };
}

export function useAgentScore(agentId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-score', agentId],
    queryFn: () => fetchAgentData(agentId),
    enabled: Boolean(agentId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    entry: data?.entry ?? null,
    history: data?.history ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch agent score') : null,
  };
}
