'use client';

import { useCallback, useState } from 'react';
import { useWalletClient } from 'wagmi';

import type { PaymentReceipt, PaymentRequirements } from '@/lib/x402';
import { parsePaymentHeader, signPayment } from '@/lib/x402';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type X402PaymentStatus =
  | 'idle'
  | 'requiresPayment'
  | 'signing'
  | 'verifying'
  | 'complete'
  | 'error';

export interface UseX402PaymentReturn {
  /** Initiate the x402 payment flow for an endpoint. */
  pay: (endpoint: string, fetchOptions?: RequestInit) => Promise<PaymentReceipt | null>;
  /** Current payment status. */
  status: X402PaymentStatus;
  /** The receipt from a completed payment. */
  receipt: PaymentReceipt | null;
  /** Error from the last payment attempt. */
  error: Error | null;
  /** Reset the hook back to idle state. */
  reset: () => void;
  /** Whether a payment operation is currently in progress. */
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook for the x402 payment flow.
 *
 * Integrates with wagmi `useWalletClient` for transaction signing.
 *
 * Usage:
 * ```tsx
 * const { pay, status, receipt, error, reset, isLoading } = useX402Payment();
 *
 * const handlePay = async () => {
 *   const receipt = await pay('/api/deploy/usdc');
 *   if (receipt) {
 *     console.log('Paid!', receipt);
 *   }
 * };
 * ```
 */
export function useX402Payment(): UseX402PaymentReturn {
  const { data: walletClient } = useWalletClient();
  const [status, setStatus] = useState<X402PaymentStatus>('idle');
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setReceipt(null);
    setError(null);
  }, []);

  const pay = useCallback(
    async (
      endpoint: string,
      fetchOptions?: RequestInit
    ): Promise<PaymentReceipt | null> => {
      if (!walletClient) {
        const err = new Error('Wallet not connected. Please connect your wallet first.');
        setError(err);
        setStatus('error');
        return null;
      }

      try {
        setError(null);
        setReceipt(null);

        // Step 1: Make initial request to get 402 + payment requirements
        setStatus('requiresPayment');

        const initialResponse = await fetch(endpoint, {
          ...fetchOptions,
          method: fetchOptions?.method ?? 'GET',
        });

        // If not 402, no payment needed — just return
        if (initialResponse.status !== 402) {
          setStatus('complete');
          return null;
        }

        // Extract payment requirements
        const paymentRequiredHeader = initialResponse.headers.get('X-PAYMENT-REQUIRED');
        if (!paymentRequiredHeader) {
          throw new Error(
            'Received 402 response but no X-PAYMENT-REQUIRED header was present.'
          );
        }

        const requirements: PaymentRequirements = parsePaymentHeader(paymentRequiredHeader);

        // Step 2: Sign payment
        setStatus('signing');

        const payment = await signPayment(walletClient, requirements);

        // Step 3: Retry with payment header
        setStatus('verifying');

        const paymentHeaderValue = JSON.stringify({
          signature: payment.signature,
          payload: payment.payload,
          calldata: payment.calldata,
        });

        const paidResponse = await fetch(endpoint, {
          ...fetchOptions,
          method: fetchOptions?.method ?? 'GET',
          headers: {
            ...fetchOptions?.headers,
            'X-PAYMENT': paymentHeaderValue,
          },
        });

        if (paidResponse.status === 402) {
          throw new Error('Payment was rejected by the server.');
        }

        if (!paidResponse.ok) {
          const body: unknown = await paidResponse.json().catch(() => null);
          const msg =
            body !== null &&
            typeof body === 'object' &&
            'error' in body &&
            typeof (body as Record<string, unknown>).error === 'object' &&
            (body as Record<string, Record<string, unknown>>).error !== null &&
            'message' in (body as Record<string, Record<string, unknown>>).error
              ? String(
                  (body as Record<string, Record<string, string>>).error.message
                )
              : `Server returned ${paidResponse.status}`;
          throw new Error(msg);
        }

        // Build receipt
        const paymentReceipt: PaymentReceipt = {
          payer: payment.payload.from,
          payee: payment.payload.to,
          amount: payment.payload.value,
          resource: requirements.resource,
          timestamp: Math.floor(Date.now() / 1000),
          signature: payment.signature,
        };

        setReceipt(paymentReceipt);
        setStatus('complete');
        return paymentReceipt;
      } catch (err) {
        const paymentError =
          err instanceof Error ? err : new Error('Unknown payment error.');
        setError(paymentError);
        setStatus('error');
        return null;
      }
    },
    [walletClient]
  );

  const isLoading =
    status === 'requiresPayment' ||
    status === 'signing' ||
    status === 'verifying';

  return {
    pay,
    status,
    receipt,
    error,
    reset,
    isLoading,
  };
}
