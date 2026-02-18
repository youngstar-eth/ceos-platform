'use client';

import { useReadContract } from 'wagmi';
import { type Address } from 'viem';
import {
  getAgentTreasuryContract,
} from '@/lib/contracts';

// ── Treasury Reads ───────────────────────────────────

export function useTreasuryETHBalance(treasuryAddress?: Address) {
  const enabled = !!treasuryAddress && treasuryAddress !== '0x';

  return useReadContract({
    ...getAgentTreasuryContract(treasuryAddress ?? '0x'),
    functionName: 'getETHBalance',
    query: {
      enabled,
      refetchInterval: 30_000,
    },
  });
}

export function useTreasuryTrackedBalances(treasuryAddress?: Address) {
  const enabled = !!treasuryAddress && treasuryAddress !== '0x';

  return useReadContract({
    ...getAgentTreasuryContract(treasuryAddress ?? '0x'),
    functionName: 'getTrackedBalances',
    query: {
      enabled,
      refetchInterval: 30_000,
    },
  });
}

export function useTreasuryBurnStats(treasuryAddress?: Address) {
  const enabled = !!treasuryAddress && treasuryAddress !== '0x';

  const { data: totalBurns, isLoading: burnsLoading } = useReadContract({
    ...getAgentTreasuryContract(treasuryAddress ?? '0x'),
    functionName: 'getTotalBurns',
    query: { enabled },
  });

  const { data: totalBurnedAmount, isLoading: amountLoading } = useReadContract({
    ...getAgentTreasuryContract(treasuryAddress ?? '0x'),
    functionName: 'getTotalBurnedAmount',
    query: { enabled },
  });

  return {
    totalBurns: totalBurns as bigint | undefined,
    totalBurnedAmount: totalBurnedAmount as bigint | undefined,
    isLoading: burnsLoading || amountLoading,
  };
}

// ── Composite Hook ───────────────────────────────────

export function useAgentFinancials(treasuryAddress?: Address) {
  const { data: ethBalance, isLoading: ethLoading } = useTreasuryETHBalance(treasuryAddress);
  const { data: trackedBalances, isLoading: tokensLoading } = useTreasuryTrackedBalances(treasuryAddress);
  const { totalBurns, totalBurnedAmount, isLoading: burnLoading } = useTreasuryBurnStats(treasuryAddress);

  return {
    ethBalance: ethBalance as bigint | undefined,
    trackedBalances: trackedBalances as readonly { token: Address; balance: bigint }[] | undefined,
    totalBurns,
    totalBurnedAmount,
    isLoading: ethLoading || tokensLoading || burnLoading,
  };
}
