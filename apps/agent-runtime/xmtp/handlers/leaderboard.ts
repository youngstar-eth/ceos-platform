/* ============================================================
 * XMTP Chat Agent — Leaderboard Handler
 *
 * Handles: "show leaderboard", "top 10", "leaderboard", "rankings"
 * Fetches from the internal leaderboard API and formats results.
 * ============================================================ */

import type { LeaderboardResponse } from "@openclaw/shared/types/ceos-score";
import { xmtpConfig } from "../config.js";
import { formatLeaderboard } from "../utils/formatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiSuccessResponse {
  success: true;
  data: LeaderboardResponse;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Fetch and format the CEOS Score leaderboard.
 *
 * @param limit - Number of entries to display (default 10, max 25)
 */
export async function handleLeaderboard(limit: number = 10): Promise<string> {
  try {
    const clampedLimit = Math.max(1, Math.min(25, limit));
    const url = `${xmtpConfig.LEADERBOARD_API_URL}/api/leaderboard?limit=${clampedLimit}&sortBy=totalScore`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return `Failed to fetch leaderboard (HTTP ${response.status}). Please try again later.`;
    }

    const body: unknown = await response.json();

    if (!isApiSuccessResponse(body)) {
      return "Leaderboard data is temporarily unavailable. Please try again later.";
    }

    return formatLeaderboard(body.data.entries);
  } catch (error: unknown) {
    if (isTimeoutError(error)) {
      return "Leaderboard request timed out. Please try again.";
    }
    return "An error occurred while fetching the leaderboard. Please try again later.";
  }
}

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

function isApiSuccessResponse(value: unknown): value is ApiSuccessResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.success !== true) return false;
  if (typeof obj.data !== "object" || obj.data === null) return false;
  const data = obj.data as Record<string, unknown>;
  return Array.isArray(data.entries);
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "TimeoutError") return true;
  return false;
}
