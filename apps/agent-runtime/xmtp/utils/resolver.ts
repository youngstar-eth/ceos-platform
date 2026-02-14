/* ============================================================
 * XMTP Chat Agent — Agent & Address Resolver
 *
 * Resolves agent names and Ethereum addresses from user input.
 * No external dependencies — pure string matching.
 * ============================================================ */

import type { LeaderboardEntry } from "@ceosrun/shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ethereum address regex (checksummed or lowercase) */
const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

// ---------------------------------------------------------------------------
// Public Functions
// ---------------------------------------------------------------------------

/**
 * Find an agent by @name or partial name match from leaderboard entries.
 *
 * Resolution order:
 * 1. Exact match on agentName (case-insensitive)
 * 2. Exact match on agentName with @ prefix stripped
 * 3. Starts-with partial match (case-insensitive)
 * 4. Contains partial match (case-insensitive)
 *
 * Returns null if no match is found.
 */
export function resolveAgent(
  query: string,
  entries: LeaderboardEntry[]
): LeaderboardEntry | null {
  if (!query || entries.length === 0) return null;

  // Strip @ prefix if present
  const cleanQuery = query.startsWith("@") ? query.slice(1) : query;
  const lowerQuery = cleanQuery.toLowerCase().trim();

  if (lowerQuery.length === 0) return null;

  // 1. Exact match
  const exactMatch = entries.find(
    (e) => e.agentName.toLowerCase() === lowerQuery
  );
  if (exactMatch) return exactMatch;

  // 2. Starts-with match
  const startsWithMatch = entries.find((e) =>
    e.agentName.toLowerCase().startsWith(lowerQuery)
  );
  if (startsWithMatch) return startsWithMatch;

  // 3. Contains match
  const containsMatch = entries.find((e) =>
    e.agentName.toLowerCase().includes(lowerQuery)
  );
  if (containsMatch) return containsMatch;

  return null;
}

/**
 * Validate and clean an Ethereum address from user input.
 *
 * Accepts:
 * - Full 0x-prefixed address (42 chars)
 * - Lowercase or checksummed
 *
 * Returns the cleaned lowercase address, or null if invalid.
 */
export function resolveAddress(query: string): string | null {
  if (!query) return null;

  const trimmed = query.trim();

  if (ETH_ADDRESS_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

/**
 * Find an agent by their on-chain address from leaderboard entries.
 */
export function resolveAgentByAddress(
  address: string,
  entries: LeaderboardEntry[]
): LeaderboardEntry | null {
  const cleanAddress = resolveAddress(address);
  if (!cleanAddress) return null;

  return (
    entries.find(
      (e) => e.agentAddress.toLowerCase() === cleanAddress
    ) ?? null
  );
}
