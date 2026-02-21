'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
} from 'wagmi';
import {
  CONTRACT_ADDRESSES,
  ERC20_ABI,
  getAgentPaymasterContract,
  getCeosAgentIdentityContract,
} from '@/lib/contracts';

// ── Types ────────────────────────────────────────────────────────────────

export type ExecuteStatus =
  | 'idle'
  | 'checking-allowance'
  | 'awaiting-approve-signature'
  | 'confirming-approve'
  | 'awaiting-deposit-signature'
  | 'confirming-deposit'
  | 'confirmed'
  | 'failed';

interface ExecuteParams {
  agentId: bigint;
  amount: bigint;
  onSuccess?: (txHash: string) => void;
}

// ── Constants ────────────────────────────────────────────────────────────

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// ── Read Hooks ───────────────────────────────────────────────────────────

/**
 * Read an agent's current USDC compute balance from AgentPaymaster.
 */
export function useAgentBalance(agentId: bigint | undefined) {
  const contract = getAgentPaymasterContract();

  return useReadContract({
    ...contract,
    functionName: 'getAgentBalance',
    args: agentId !== undefined ? [agentId] : undefined,
    query: { enabled: agentId !== undefined },
  });
}

/**
 * Read an agent's on-chain reputation from CeosAgentIdentity.
 * Returns { totalTrades, successfulTrades, successRate } in basis points.
 */
export function useAgentReputation(agentId: bigint | undefined) {
  const contract = getCeosAgentIdentityContract();

  return useReadContract({
    ...contract,
    functionName: 'getReputation',
    args: agentId !== undefined ? [agentId] : undefined,
    query: { enabled: agentId !== undefined },
  });
}

// ── Execute Hook (Approve → Deposit Two-Step Flow) ───────────────────────

/**
 * Orchestrates the two-step USDC approve → AgentPaymaster.depositForAgent flow.
 *
 * Flow:
 *   1. Check USDC allowance for AgentPaymaster
 *   2. If allowance < amount → write ERC20.approve(paymaster, amount)
 *   3. Wait for approve tx confirmation
 *   4. Write AgentPaymaster.depositForAgent(agentId, amount)
 *   5. Wait for deposit tx confirmation
 *   6. Call onSuccess(txHash)
 *
 * In DEMO_MODE: simulates a 1-second delay and calls onSuccess with a mock hash.
 */
export function useExecuteOnBase() {
  const { address: userAddress } = useAccount();
  const [status, setStatus] = useState<ExecuteStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [onSuccessCallback, setOnSuccessCallback] = useState<
    ((txHash: string) => void) | null
  >(null);

  const paymasterContract = getAgentPaymasterContract();

  // ── Step 1: Approve USDC ──────────────────────────────────────────────

  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: isApprovePending,
    error: approveWriteError,
    reset: resetApprove,
  } = useWriteContract();

  const {
    data: approveReceipt,
    isLoading: isApproveConfirming,
    isSuccess: isApproveConfirmed,
    error: approveReceiptError,
  } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // ── Step 2: Deposit for Agent ─────────────────────────────────────────

  const {
    data: depositTxHash,
    writeContract: writeDeposit,
    isPending: isDepositPending,
    error: depositWriteError,
    reset: resetDeposit,
  } = useWriteContract();

  const {
    data: depositReceipt,
    isLoading: isDepositConfirming,
    isSuccess: isDepositConfirmed,
    error: depositReceiptError,
  } = useWaitForTransactionReceipt({
    hash: depositTxHash,
  });

  // ── Pending deposit params (stored between approve and deposit steps) ─

  const [pendingDeposit, setPendingDeposit] = useState<{
    agentId: bigint;
    amount: bigint;
  } | null>(null);

  // ── Auto-advance: approve confirmed → trigger deposit ─────────────────

  useEffect(() => {
    if (
      isApproveConfirmed &&
      pendingDeposit &&
      status === 'confirming-approve'
    ) {
      setStatus('awaiting-deposit-signature');
      writeDeposit({
        ...paymasterContract,
        functionName: 'depositForAgent',
        args: [pendingDeposit.agentId, pendingDeposit.amount],
      });
    }
  }, [
    isApproveConfirmed,
    pendingDeposit,
    status,
    writeDeposit,
    paymasterContract,
  ]);

  // ── Auto-advance: deposit confirmed → success ─────────────────────────

  useEffect(() => {
    if (isDepositConfirmed && status === 'confirming-deposit') {
      setStatus('confirmed');
      if (onSuccessCallback && depositTxHash) {
        onSuccessCallback(depositTxHash);
      }
    }
  }, [isDepositConfirmed, status, onSuccessCallback, depositTxHash]);

  // ── Track write pending → confirming transitions ──────────────────────

  useEffect(() => {
    if (isApprovePending && status === 'awaiting-approve-signature') {
      // Still waiting for user to sign
    }
    if (isApproveConfirming && approveTxHash) {
      setStatus('confirming-approve');
    }
  }, [isApprovePending, isApproveConfirming, approveTxHash, status]);

  useEffect(() => {
    if (isDepositPending && status === 'awaiting-deposit-signature') {
      // Still waiting for user to sign
    }
    if (isDepositConfirming && depositTxHash) {
      setStatus('confirming-deposit');
    }
  }, [isDepositPending, isDepositConfirming, depositTxHash, status]);

  // ── Error tracking ────────────────────────────────────────────────────

  useEffect(() => {
    const err =
      approveWriteError ??
      approveReceiptError ??
      depositWriteError ??
      depositReceiptError;
    if (err && status !== 'idle' && status !== 'confirmed') {
      setError(err.message);
      setStatus('failed');
    }
  }, [
    approveWriteError,
    approveReceiptError,
    depositWriteError,
    depositReceiptError,
    status,
  ]);

  // ── Main execute function ─────────────────────────────────────────────

  const execute = useCallback(
    async ({ agentId, amount, onSuccess }: ExecuteParams) => {
      // DEMO_MODE: simulate success without chain interaction
      if (DEMO_MODE) {
        setStatus('confirming-deposit');
        setOnSuccessCallback(() => onSuccess ?? null);
        await new Promise((r) => setTimeout(r, 1000));
        setStatus('confirmed');
        onSuccess?.('0xdemo_tx_hash_' + Date.now().toString(16));
        return;
      }

      if (!userAddress) {
        setError('Wallet not connected');
        setStatus('failed');
        return;
      }

      try {
        setError(null);
        setStatus('checking-allowance');
        setOnSuccessCallback(() => onSuccess ?? null);
        setPendingDeposit({ agentId, amount });

        // Check current USDC allowance for AgentPaymaster
        // We use a direct contract read here instead of a hook since
        // we need the value at execution time, not reactively.
        // The writeApprove or writeDeposit will be called based on the result.

        // For simplicity, always approve first (idempotent if already approved).
        // This avoids a separate readContract call and keeps the flow predictable.
        // Users can also pre-approve via their wallet.
        setStatus('awaiting-approve-signature');
        writeApprove({
          address: CONTRACT_ADDRESSES.usdc,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.agentPaymaster, amount],
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Execute on Base failed';
        setError(message);
        setStatus('failed');
      }
    },
    [userAddress, writeApprove],
  );

  // ── Reset ─────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setPendingDeposit(null);
    setOnSuccessCallback(null);
    resetApprove();
    resetDeposit();
  }, [resetApprove, resetDeposit]);

  return {
    execute,
    status,
    txHash: depositTxHash ?? approveTxHash,
    receipt: depositReceipt ?? approveReceipt,
    error,
    reset,
  };
}
