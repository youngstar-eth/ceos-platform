import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEth(value: bigint, decimals = 4): string {
  const eth = Number(value) / 1e18;
  return `${eth.toFixed(decimals)} ETH`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format micro-USDC (6 decimals) to a human-readable price string.
 * e.g. "5000000" → "$5.00", "500" → "$0.0005"
 */
export function formatUsdcPrice(microUsdc: string | number | bigint): string {
  const value = Number(microUsdc) / 1_000_000;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Get the correct BaseScan URL based on the current chain ID.
 * Returns sepolia.basescan.org for testnet, basescan.org for mainnet.
 */
export function getBaseScanUrl(): string {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '84532');
  return chainId === 8453
    ? 'https://basescan.org'
    : 'https://sepolia.basescan.org';
}

