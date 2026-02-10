'use client';

import { useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USDC_DECIMALS = 6;

/** Minimal USDC ERC-20 ABI for balanceOf. */
const USDC_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** Auto-refresh interval in milliseconds (15 seconds). */
const REFRESH_INTERVAL_MS = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface USDCBalanceProps {
  /** Override the USDC contract address. Defaults to NEXT_PUBLIC_USDC_CONTRACT env var. */
  usdcContract?: `0x${string}`;
  /** Optional CSS class name for the wrapper. */
  className?: string;
  /** Whether to show the USDC label. Defaults to true. */
  showLabel?: boolean;
  /** Number of decimal places to display. Defaults to 2. */
  displayDecimals?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function USDCBalance({
  usdcContract,
  className,
  showLabel = true,
  displayDecimals = 2,
}: USDCBalanceProps) {
  const { address, isConnected } = useAccount();

  const contractAddress =
    usdcContract ??
    (process.env.NEXT_PUBLIC_USDC_CONTRACT as `0x${string}` | undefined);

  const {
    data: rawBalance,
    isLoading,
    isError,
    refetch,
  } = useReadContract({
    address: contractAddress,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address && !!contractAddress,
    },
  });

  // Auto-refresh the balance
  useEffect(() => {
    if (!isConnected || !address || !contractAddress) return;

    const interval = setInterval(() => {
      void refetch();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isConnected, address, contractAddress, refetch]);

  // Format the balance
  const formattedBalance =
    rawBalance !== undefined
      ? formatBalance(rawBalance as bigint, displayDecimals)
      : null;

  if (!isConnected) {
    return null;
  }

  if (!contractAddress) {
    return (
      <span className={`text-xs text-gray-400 ${className ?? ''}`}>
        USDC contract not configured
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-sm ${className ?? ''}`}
    >
      {/* USDC icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="16" cy="16" r="16" fill="#2775CA" />
        <path
          d="M20.4 18.2c0-2-1.2-2.7-3.6-3-.7-.1-1.5-.3-2.1-.5-.4-.2-.7-.5-.7-1s.3-.9.7-1c.5-.2 1.3-.2 2 0 .4.1.8.3 1.1.5.1.1.3.1.4 0l.8-.8c.1-.1.1-.3 0-.4-.5-.4-1.1-.7-1.7-.8V10c0-.2-.1-.3-.3-.3h-1.2c-.2 0-.3.1-.3.3v1.2c-1.8.3-2.9 1.4-2.9 2.8s1.2 2.6 3.5 2.9c.8.2 1.6.3 2.2.6.4.2.6.5.6 1 0 .7-.6 1.2-1.5 1.2-.8 0-1.5-.2-2.1-.7-.1-.1-.3-.1-.4 0l-.9.8c-.1.1-.1.3 0 .4.7.6 1.5.9 2.5 1.1V22c0 .2.1.3.3.3h1.2c.2 0 .3-.1.3-.3v-1.3c1.8-.2 3-1.3 3-2.5z"
          fill="white"
        />
      </svg>

      {/* Balance value */}
      {isLoading ? (
        <span className="text-gray-400">...</span>
      ) : isError ? (
        <span className="text-red-400">Error</span>
      ) : (
        <span className="font-medium tabular-nums">
          {formattedBalance}
        </span>
      )}

      {/* Label */}
      {showLabel && (
        <span className="text-gray-500 text-xs">USDC</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBalance(raw: bigint, decimals: number): string {
  const formatted = formatUnits(raw, USDC_DECIMALS);
  const num = Number(formatted);

  if (num === 0) return '0.00';

  // For very small balances, show more precision
  if (num > 0 && num < 0.01) {
    return num.toFixed(6);
  }

  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
