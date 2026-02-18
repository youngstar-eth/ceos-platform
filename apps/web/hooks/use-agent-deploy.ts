'use client';

import { useCallback } from 'react';
import { useDeploy } from '@/hooks/use-deploy';

/**
 * Thin adapter over `useDeploy` exposing a simplified API
 * for deploy button components.
 *
 * Maps the internal `DeployStatus` state machine to
 * flat boolean flags (`isWalletConfirming`, `isMining`, `isDeployed`).
 */
export function useAgentDeploy() {
  const { deploy, status, txHash, receipt, error, reset } = useDeploy();

  const deployAgent = useCallback(
    (name: string, symbol: string, metadataUri: string) => {
      deploy({ name, symbol, metadataUri });
    },
    [deploy]
  );

  return {
    deployAgent,
    hash: txHash,
    receipt,
    error,
    reset,
    // ── Derived boolean flags ──
    isWalletConfirming: status === 'awaiting-signature',
    isMining: status === 'pending',
    isDeployed: status === 'confirmed',
    isFailed: status === 'failed',
    status,
  };
}
