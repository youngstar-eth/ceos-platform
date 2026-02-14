'use client';

import { useState, useEffect, useCallback } from 'react';

interface WalletStatus {
  address: string | null;
  email: string | null;
  sessionLimit: number;
  txLimit: number;
  autoFund: boolean;
  totalSpent: string | null;
  transactionCount: number;
  usdcBalance: string | null;
}

interface UseAgentWalletReturn {
  wallet: WalletStatus | null;
  isLoading: boolean;
  error: string | null;
  updateLimits: (sessionLimit?: number, txLimit?: number) => Promise<void>;
  refresh: () => void;
}

export function useAgentWallet(agentId: string | undefined): UseAgentWalletReturn {
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!agentId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/wallet`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Failed to fetch wallet');
      }

      setWallet(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setWallet(null);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void fetchWallet();
  }, [fetchWallet]);

  const updateLimits = useCallback(async (sessionLimit?: number, txLimit?: number) => {
    if (!agentId) return;

    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/wallet`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionLimit, txLimit }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Failed to update limits');
      }

      // Refresh wallet data
      await fetchWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [agentId, fetchWallet]);

  return {
    wallet,
    isLoading,
    error,
    updateLimits,
    refresh: fetchWallet,
  };
}
