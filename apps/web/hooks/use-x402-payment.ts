'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadContract, useAccount } from 'wagmi';
import {
  type PaymentRequirements,
  type PaymentReceipt,
  x402Fetch,
  formatX402Amount,
} from '@/lib/x402';
import { getUSDCContract } from '@/lib/contracts';

export type PaymentStatus =
  | 'idle'
  | 'fetching'
  | 'payment-required'
  | 'paying'
  | 'confirming'
  | 'success'
  | 'error';

interface PaymentResult {
  data: unknown;
  receipt: PaymentReceipt | null;
}

interface PaymentHistoryItem {
  id: string;
  resource: string;
  amount: string;
  timestamp: string;
  status: 'completed' | 'failed';
}

interface PaymentHistoryResponse {
  success: boolean;
  data: PaymentHistoryItem[];
}

export function useX402Payment() {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [requirements, setRequirements] =
    useState<PaymentRequirements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);

  const makePayment = useCallback(
    async (url: string, options?: RequestInit) => {
      try {
        setError(null);
        setStatus('fetching');

        const response = await x402Fetch(url, options, async (reqs) => {
          setRequirements(reqs);
          setStatus('payment-required');

          // In a real implementation, this would trigger a wallet signature
          // For now, we simulate the payment flow
          setStatus('paying');

          // Placeholder: the actual payment signing would happen here
          // via wagmi's useSignTypedData or similar
          const receipt: PaymentReceipt = {
            payload: '',
            signature: '',
          };

          setStatus('confirming');
          return receipt;
        });

        if (response.ok) {
          const data: unknown = await response.json();
          setResult({ data, receipt: null });
          setStatus('success');
        } else {
          throw new Error(`Request failed with status ${response.status}`);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Payment failed';
        setError(message);
        setStatus('error');
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setRequirements(null);
    setError(null);
    setResult(null);
  }, []);

  return {
    makePayment,
    status,
    requirements,
    error,
    result,
    reset,
    formattedAmount: requirements
      ? formatX402Amount(requirements.maxAmountRequired)
      : null,
  };
}

export function usePaymentHistory() {
  return useQuery({
    queryKey: ['x402-receipts'],
    queryFn: async (): Promise<PaymentHistoryResponse> => {
      const res = await fetch('/api/x402/receipts');
      if (!res.ok) {
        throw new Error('Failed to fetch payment history');
      }
      return res.json() as Promise<PaymentHistoryResponse>;
    },
  });
}

export function useUSDCBalance() {
  const { address } = useAccount();
  const contract = getUSDCContract();

  return useReadContract({
    ...contract,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });
}
