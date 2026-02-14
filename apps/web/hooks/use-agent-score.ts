"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  CEOSScoreBreakdown,
} from "@ceosrun/shared/types/ceos-score";

interface UseAgentScoreReturn {
  entry: LeaderboardEntry | null;
  history: CEOSScoreBreakdown[] | null;
  isLoading: boolean;
  error: string | null;
}

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
    throw new Error(json.error?.message ?? "Unknown error fetching leaderboard");
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

export function useAgentScore(agentId: string): UseAgentScoreReturn {
  const [entry, setEntry] = useState<LeaderboardEntry | null>(null);
  const [history, setHistory] = useState<CEOSScoreBreakdown[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(() => {
    if (!agentId) {
      setIsLoading(false);
      return;
    }

    const id = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    Promise.all([fetchAgentEntry(agentId), fetchScoreHistory(agentId)])
      .then(([entryResult, historyResult]) => {
        if (id === fetchIdRef.current) {
          setEntry(entryResult);
          setHistory(historyResult);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (id === fetchIdRef.current) {
          const message = err instanceof Error ? err.message : "Failed to fetch agent score";
          setError(message);
          setIsLoading(false);
        }
      });
  }, [agentId]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { entry, history, isLoading, error };
}
