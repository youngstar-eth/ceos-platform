"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { LeaderboardResponse } from "@ceosrun/shared/types";

interface UseLeaderboardParams {
  page?: number;
  limit?: number;
  tier?: number;
  sortBy?: string;
}

interface UseLeaderboardReturn {
  data: LeaderboardResponse | null;
  isLoading: boolean;
  error: string | null;
  mutate: () => void;
}

async function fetchLeaderboard(params: UseLeaderboardParams): Promise<LeaderboardResponse> {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.tier !== undefined) {
    searchParams.set("tier", String(params.tier));
  }
  if (params.sortBy !== undefined) {
    searchParams.set("sortBy", params.sortBy);
  }

  const url = `/api/leaderboard?${searchParams.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch leaderboard: ${res.status}`);
  }

  const json = (await res.json()) as { success: boolean; data: LeaderboardResponse; error?: { message: string } };

  if (!json.success) {
    throw new Error(json.error?.message ?? "Unknown error fetching leaderboard");
  }

  return json.data;
}

export function useLeaderboard(params: UseLeaderboardParams = {}): UseLeaderboardReturn {
  const { page, limit, tier, sortBy } = params;
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    const id = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    fetchLeaderboard({ page, limit, tier, sortBy })
      .then((result) => {
        if (id === fetchIdRef.current) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (id === fetchIdRef.current) {
          const message = err instanceof Error ? err.message : "Failed to fetch leaderboard";
          setError(message);
          setIsLoading(false);
        }
      });
  }, [page, limit, tier, sortBy]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const mutate = useCallback(() => {
    doFetch();
  }, [doFetch]);

  return { data, isLoading, error, mutate };
}
