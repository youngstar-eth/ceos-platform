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
 * Get the correct BaseScan URL based on the current chain ID.
 * Returns sepolia.basescan.org for testnet, basescan.org for mainnet.
 */
export function getBaseScanUrl(): string {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '84532');
  return chainId === 8453
    ? 'https://basescan.org'
    : 'https://sepolia.basescan.org';
}

