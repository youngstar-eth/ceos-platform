/* ============================================================
 * XMTP Chat Agent — Trading Handler
 *
 * Handles: "top volume", "best pnl", "win rate leaders",
 *          "top traders", "trading stats"
 * Fetches trading-sorted leaderboard data.
 * ============================================================ */

import type {
  LeaderboardEntry,
  LeaderboardResponse,
} from "@ceosrun/shared/types/ceos-score";
import { xmtpConfig } from "../config.js";
import { formatTradingLeaderboard } from "../utils/formatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiSuccessResponse {
  success: true;
  data: LeaderboardResponse;
}

/** Supported trading sort modes */
type TradingSortMode = "volume" | "pnl" | "winRate" | "default";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Fetch and display trading-specific leaderboard.
 *
 * @param sortMode - How to sort/filter trading data
 * @param limit    - Number of entries (default 10, max 25)
 */
export async function handleTrading(
  sortMode: TradingSortMode = "default",
  limit: number = 10
): Promise<string> {
  try {
    const clampedLimit = Math.max(1, Math.min(25, limit));
    const url = `${xmtpConfig.LEADERBOARD_API_URL}/api/leaderboard?limit=${clampedLimit}&sortBy=trading`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return `Failed to fetch trading data (HTTP ${response.status}). Please try again later.`;
    }

    const body: unknown = await response.json();
    if (!isApiSuccessResponse(body)) {
      return "Trading data is temporarily unavailable. Please try again later.";
    }

    const entries = body.data.entries;

    // Apply client-side sorting based on trading metrics
    const sorted = sortEntries(entries, sortMode);

    return formatTradingLeaderboard(sorted);
  } catch (error: unknown) {
    if (isTimeoutError(error)) {
      return "Trading data request timed out. Please try again.";
    }
    return "An error occurred while fetching trading data. Please try again later.";
  }
}

/**
 * Detect the trading sort mode from user message text.
 */
export function detectTradingSortMode(message: string): TradingSortMode {
  const lower = message.toLowerCase();

  if (/\bvolume\b/.test(lower)) return "volume";
  if (/\bpnl\b|\bprofit\b|\bp&l\b/.test(lower)) return "pnl";
  if (/\bwin\s*rate\b/.test(lower)) return "winRate";

  return "default";
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Sort entries by specific trading metric (client-side).
 * Entries without trading metrics are placed at the end.
 */
function sortEntries(
  entries: LeaderboardEntry[],
  mode: TradingSortMode
): LeaderboardEntry[] {
  if (mode === "default") return entries;

  const withMetrics = entries.filter((e) => e.tradingMetrics !== null);
  const withoutMetrics = entries.filter((e) => e.tradingMetrics === null);

  const sorted = [...withMetrics].sort((a, b) => {
    const tmA = a.tradingMetrics;
    const tmB = b.tradingMetrics;
    if (!tmA || !tmB) return 0;

    switch (mode) {
      case "volume":
        return tmB.volume - tmA.volume;
      case "pnl":
        return tmB.pnl - tmA.pnl;
      case "winRate":
        return tmB.winRate - tmA.winRate;
      default:
        return 0;
    }
  });

  return [...sorted, ...withoutMetrics];
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
