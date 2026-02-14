/* ============================================================
 * XMTP Chat Agent — Score Handler
 *
 * Handles: "my score", "score @agentname", "score 0x..."
 * Fetches agent score from leaderboard API and shows breakdown.
 * ============================================================ */

import type {
  LeaderboardEntry,
  LeaderboardResponse,
} from "@ceosrun/shared/types/ceos-score";
import { xmtpConfig } from "../config.js";
import { formatScoreBreakdown, formatTradingStats } from "../utils/formatter.js";
import {
  resolveAgent,
  resolveAddress,
  resolveAgentByAddress,
} from "../utils/resolver.js";

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
 * Handle "my score" — lookup by sender wallet address.
 */
export async function handleMyScore(senderAddress: string): Promise<string> {
  try {
    const entries = await fetchAllEntries();
    if (!entries) {
      return "Unable to fetch scores. Please try again later.";
    }

    const cleanAddress = resolveAddress(senderAddress);
    if (!cleanAddress) {
      return "Could not resolve your wallet address. Please try again.";
    }

    const entry = resolveAgentByAddress(cleanAddress, entries);
    if (!entry) {
      return `No agent found for address ${cleanAddress.slice(0, 6)}...${cleanAddress.slice(-4)}. Deploy an agent first!`;
    }

    return buildScoreResponse(entry);
  } catch {
    return "An error occurred while fetching your score. Please try again later.";
  }
}

/**
 * Handle "score @name" or "score 0x..." — lookup by name or address.
 */
export async function handleAgentScore(query: string): Promise<string> {
  try {
    if (!query || query.trim().length === 0) {
      return 'Please specify an agent. Usage: "score @agentname" or "score 0x..."';
    }

    const entries = await fetchAllEntries();
    if (!entries) {
      return "Unable to fetch scores. Please try again later.";
    }

    const trimmedQuery = query.trim();

    // Try address resolution first
    const addressMatch = resolveAddress(trimmedQuery);
    if (addressMatch) {
      const entry = resolveAgentByAddress(addressMatch, entries);
      if (!entry) {
        return `No agent found for address ${addressMatch.slice(0, 6)}...${addressMatch.slice(-4)}.`;
      }
      return buildScoreResponse(entry);
    }

    // Try name resolution
    const entry = resolveAgent(trimmedQuery, entries);
    if (!entry) {
      return `No agent found matching "${trimmedQuery}". Try "show leaderboard" to see all agents.`;
    }

    return buildScoreResponse(entry);
  } catch {
    return "An error occurred while looking up the agent score. Please try again later.";
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all leaderboard entries (up to 100).
 */
async function fetchAllEntries(): Promise<LeaderboardEntry[] | null> {
  try {
    const url = `${xmtpConfig.LEADERBOARD_API_URL}/api/leaderboard?limit=100&sortBy=totalScore`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (!isApiSuccessResponse(body)) return null;

    return body.data.entries;
  } catch {
    return null;
  }
}

/**
 * Build a formatted score response with optional trading stats.
 */
function buildScoreResponse(entry: LeaderboardEntry): string {
  let response = formatScoreBreakdown(entry);

  if (entry.tradingMetrics) {
    const tradingText = formatTradingStats(entry.tradingMetrics);
    const combined = response + "\n\n" + tradingText;
    // Respect 1000 char limit
    if (combined.length <= 1000) {
      response = combined;
    }
  }

  return response;
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
