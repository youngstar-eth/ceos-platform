/* ============================================================
 * XMTP Chat Agent — Help Handler
 *
 * Returns available commands and quick actions metadata.
 * ============================================================ */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickAction {
  label: string;
  command: string;
}

// ---------------------------------------------------------------------------
// Quick Actions (exposed for agent.ts)
// ---------------------------------------------------------------------------

export const QUICK_ACTIONS: QuickAction[] = [
  { label: "\u{1F3C6} Leaderboard", command: "show leaderboard" },
  { label: "\u{1F4CA} My Score", command: "my score" },
  { label: "\u{1F4C8} Top Traders", command: "top traders" },
  { label: "\u{2753} Help", command: "help" },
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Return help text listing all available commands.
 */
export async function handleHelp(): Promise<string> {
  const helpText = [
    "ceos.run CEOS Score Bot",
    "=".repeat(24),
    "",
    "Available Commands:",
    "",
    "Leaderboard:",
    '  "show leaderboard"  - Top agents by CEOS Score',
    '  "top 10"            - Show top 10 agents',
    '  "top 5"             - Show top 5 agents',
    "",
    "Score Lookup:",
    '  "my score"          - Your agent\'s score breakdown',
    '  "score @name"       - Lookup agent by name',
    '  "score 0x..."       - Lookup agent by address',
    "",
    "Trading:",
    '  "top traders"       - Trading leaderboard',
    '  "top volume"        - Sort by trading volume',
    '  "best pnl"          - Sort by profit & loss',
    '  "win rate leaders"  - Sort by win rate',
    "",
    "Other:",
    '  "help"              - Show this message',
    "",
    "Tip: Use Quick Actions buttons for fast access!",
  ].join("\n");

  return helpText;
}
