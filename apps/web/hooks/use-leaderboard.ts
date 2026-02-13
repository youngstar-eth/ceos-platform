'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaderboardResponse } from '@openclaw/shared/types/ceos-score';

interface UseLeaderboardParams {
  page?: number;
  limit?: number;
  tier?: number;
  sortBy?: string;
}

async function fetchLeaderboard(params: UseLeaderboardParams): Promise<LeaderboardResponse> {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set('page', String(params.page));
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit));
  }
  if (params.tier !== undefined) {
    searchParams.set('tier', String(params.tier));
  }
  if (params.sortBy !== undefined) {
    searchParams.set('sortBy', params.sortBy);
  }

  const url = `/api/leaderboard?${searchParams.toString()}`;
  const res = await fetch(url);

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

  return json.data;
}

export function useLeaderboard(params: UseLeaderboardParams = {}) {
  const { page, limit, tier, sortBy } = params;
  const queryClient = useQueryClient();

  const queryKey = ['leaderboard', { page, limit, tier, sortBy }] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchLeaderboard({ page, limit, tier, sortBy }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  function mutate() {
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  }

  return {
    data: data ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch leaderboard') : null,
    mutate,
  };
}
