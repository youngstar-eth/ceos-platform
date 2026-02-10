'use client';

import { useState, useCallback } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { parseEther } from 'viem';
import { getAgentFactoryContract } from '@/lib/contracts';

export type DeployStatus =
  | 'idle'
  | 'preparing'
  | 'awaiting-signature'
  | 'pending'
  | 'confirmed'
  | 'failed';

interface DeployAgentParams {
  name: string;
  metadataUri: string;
}

export function useDeploy() {
  const [status, setStatus] = useState<DeployStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const contract = getAgentFactoryContract();

  const {
    data: txHash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const deploy = useCallback(
    async (params: DeployAgentParams) => {
      try {
        setError(null);
        setStatus('preparing');

        setStatus('awaiting-signature');
        writeContract({
          ...contract,
          functionName: 'deployAgent',
          args: [params.name, params.metadataUri],
          value: parseEther('0.005'),
        });

        setStatus('pending');
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Deployment failed';
        setError(message);
        setStatus('failed');
      }
    },
    [writeContract, contract]
  );

  // Derive overall status
  const derivedStatus: DeployStatus = (() => {
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isWritePending) return 'awaiting-signature';
    if (writeError ?? receiptError) return 'failed';
    return status;
  })();

  const derivedError =
    error ??
    (writeError ? writeError.message : null) ??
    (receiptError ? receiptError.message : null);

  return {
    deploy,
    status: derivedStatus,
    txHash,
    receipt,
    error: derivedError,
    reset: () => {
      setStatus('idle');
      setError(null);
    },
  };
}

export function useDeployFee() {
  const contract = getAgentFactoryContract();

  return useReadContract({
    ...contract,
    functionName: 'deployFee',
  });
}
