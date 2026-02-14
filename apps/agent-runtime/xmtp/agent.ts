/* ============================================================
 * XMTP Chat Agent — Main Entry Point
 *
 * Autonomous XMTP messaging agent for ceos.run CEOS Score v2.
 * Routes incoming messages to appropriate handlers using
 * regex/keyword matching (no LLM calls).
 *
 * Quick Actions:
 *   - Leaderboard  → "show leaderboard"
 *   - My Score     → "my score"
 *   - Top Traders  → "top traders"
 *   - Help         → "help"
 * ============================================================ */

import { handleLeaderboard } from "./handlers/leaderboard.js";
import { handleMyScore, handleAgentScore } from "./handlers/score.js";
import { handleTrading, detectTradingSortMode } from "./handlers/trading.js";
import { handleHelp, QUICK_ACTIONS } from "./handlers/help.js";
import type { QuickAction } from "./handlers/help.js";

// ---------------------------------------------------------------------------
// Quick Actions (re-exported for XMTP client setup)
// ---------------------------------------------------------------------------

export { QUICK_ACTIONS };
export type { QuickAction };

// ---------------------------------------------------------------------------
// Intent Detection Patterns
// ---------------------------------------------------------------------------

/**
 * Intent types the agent can handle.
 */
type Intent =
  | { type: "leaderboard"; limit: number }
  | { type: "my_score" }
  | { type: "agent_score"; query: string }
  | { type: "trading"; message: string }
  | { type: "help" }
  | { type: "unknown" };

/**
 * Detect user intent from message text using regex and keyword matching.
 * No LLM calls — deterministic pattern matching only.
 */
function detectIntent(message: string): Intent {
  const text = message.trim().toLowerCase();

  // --- Help ---
  if (/^(help|commands|menu|\?|\/help)$/.test(text)) {
    return { type: "help" };
  }

  // --- My Score ---
  if (/^my\s+score$/.test(text)) {
    return { type: "my_score" };
  }

  // --- Agent Score by name or address ---
  // "score @agentname" or "score 0x..."
  const scoreMatch = text.match(/^score\s+(.+)$/);
  if (scoreMatch) {
    const query = scoreMatch[1]?.trim();
    if (query) {
      return { type: "agent_score", query };
    }
  }

  // --- Leaderboard with optional limit ---
  // "top N", "show leaderboard", "leaderboard", "rankings"
  const topNMatch = text.match(/^top\s+(\d+)$/);
  if (topNMatch) {
    const limit = parseInt(topNMatch[1] ?? "10", 10);
    return { type: "leaderboard", limit: Math.max(1, Math.min(25, limit)) };
  }

  if (
    /^(show\s+)?leaderboard$/.test(text) ||
    /^rankings?$/.test(text) ||
    /^show\s+rankings?$/.test(text)
  ) {
    return { type: "leaderboard", limit: 10 };
  }

  // --- Trading ---
  // "top traders", "top volume", "best pnl", "win rate leaders",
  // "trading stats", "trading leaderboard"
  if (
    /\btop\s+traders?\b/.test(text) ||
    /\btop\s+volume\b/.test(text) ||
    /\bbest\s+pnl\b/.test(text) ||
    /\bwin\s*rate\s+(leaders?|top|best)\b/.test(text) ||
    /\btrading\s+(stats?|leaderboard|rankings?)\b/.test(text)
  ) {
    return { type: "trading", message: text };
  }

  // --- Unknown ---
  return { type: "unknown" };
}

// ---------------------------------------------------------------------------
// Message Handler
// ---------------------------------------------------------------------------

/**
 * Process an incoming XMTP message and return the response text.
 *
 * @param senderAddress - The Ethereum address of the message sender
 * @param messageText   - The raw message text from the user
 * @returns The response message to send back (max 1000 chars)
 */
export async function handleMessage(
  senderAddress: string,
  messageText: string
): Promise<string> {
  try {
    if (!messageText || messageText.trim().length === 0) {
      return await handleHelp();
    }

    const intent = detectIntent(messageText);

    switch (intent.type) {
      case "help":
        return await handleHelp();

      case "leaderboard":
        return await handleLeaderboard(intent.limit);

      case "my_score":
        return await handleMyScore(senderAddress);

      case "agent_score":
        return await handleAgentScore(intent.query);

      case "trading": {
        const sortMode = detectTradingSortMode(intent.message);
        return await handleTrading(sortMode);
      }

      case "unknown":
        return buildUnknownResponse();
    }
  } catch {
    return "Something went wrong. Please try again or type \"help\" for commands.";
  }
}

// ---------------------------------------------------------------------------
// XMTP Agent Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the XMTP agent listener.
 *
 * This function sets up the XMTP message stream pattern.
 * It is designed to work with @xmtp/agent-sdk when available,
 * but exposes a clean interface that can be adapted to any
 * XMTP client implementation.
 *
 * Usage with @xmtp/agent-sdk:
 * ```typescript
 * import { Client } from "@xmtp/agent-sdk";
 * import { handleMessage, QUICK_ACTIONS } from "./agent.js";
 *
 * const client = await Client.create(walletKey, { env });
 * for await (const message of await client.conversations.streamAllMessages()) {
 *   if (message.senderAddress === client.address) continue;
 *   const response = await handleMessage(message.senderAddress, message.content);
 *   await message.conversation.send(response);
 * }
 * ```
 */
export async function startAgent(): Promise<{
  handleMessage: typeof handleMessage;
  quickActions: QuickAction[];
}> {
  // Validate that config loads successfully (will throw on invalid env)
  // Dynamic import to avoid top-level side effects during testing
  await import("./config.js");

  return {
    handleMessage,
    quickActions: QUICK_ACTIONS,
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function buildUnknownResponse(): string {
  return [
    "I didn't understand that command.",
    "",
    "Try one of these:",
    '  "show leaderboard" - View top agents',
    '  "my score"         - Your score breakdown',
    '  "top traders"      - Trading leaderboard',
    '  "help"             - All commands',
  ].join("\n");
}
