/* ============================================================
 * @ceosrun/shared — Shared utility functions
 * ============================================================ */

/**
 * Truncate an Ethereum address to 0x1234...abcd format.
 */
export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Convert a wei bigint value to a human-readable ETH string.
 */
export function weiToEth(wei: bigint | string): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const eth = Number(value) / 1e18;
  return eth.toFixed(6);
}

/**
 * Convert a USDC raw amount (6 decimals) to a human-readable string.
 */
export function usdcToHuman(amount: bigint | string): string {
  const value = typeof amount === "string" ? BigInt(amount) : amount;
  const human = Number(value) / 1e6;
  return human.toFixed(2);
}

/**
 * Epoch duration in milliseconds (7 days).
 */
const EPOCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Genesis timestamp: 2025-01-01T00:00:00Z
 */
const GENESIS_TIMESTAMP = new Date("2025-01-01T00:00:00Z").getTime();

/**
 * Calculate the current epoch number based on a 7-day cadence from genesis.
 */
export function getCurrentEpoch(): number {
  const now = Date.now();
  return Math.floor((now - GENESIS_TIMESTAMP) / EPOCH_DURATION_MS);
}

/**
 * Calculate a composite creator score from individual metric weights.
 *
 * Weights: engagement 40%, growth 25%, quality 25%, uptime 10%
 * Each input is expected on a 0-100 scale.
 * Returns an integer score 0-100.
 */
export function calculateScore(params: {
  engagement: number;
  growth: number;
  quality: number;
  uptime: number;
}): number {
  const score =
    params.engagement * 0.4 +
    params.growth * 0.25 +
    params.quality * 0.25 +
    params.uptime * 0.1;
  return Math.round(Math.max(0, Math.min(100, score)));
}
