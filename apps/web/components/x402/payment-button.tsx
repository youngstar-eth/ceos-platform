'use client';

import { useCallback, useState } from 'react';
import { useWalletClient } from 'wagmi';

import { useX402Payment } from '@/hooks/use-x402-payment';
import type { PaymentReceipt } from '@/lib/x402';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentButtonStatus =
  | 'idle'
  | 'confirming'
  | 'signing'
  | 'verifying'
  | 'success'
  | 'error';

interface PaymentButtonProps {
  /** The x402-gated endpoint URL to pay for. */
  endpoint: string;
  /** Called when the payment succeeds with the receipt. */
  onSuccess?: (receipt: PaymentReceipt) => void;
  /** Called when the payment fails. */
  onError?: (error: Error) => void;
  /** Optional children to render as the button label. */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Price Display Helper
// ---------------------------------------------------------------------------

function formatUsdcPrice(microUnits: string): string {
  const value = Number(microUnits) / 1_000_000;
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// USDC Icon (inline SVG to avoid external deps)
// ---------------------------------------------------------------------------

function UsdcIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
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
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentButton({
  endpoint,
  onSuccess,
  onError,
  children,
}: PaymentButtonProps) {
  const { data: walletClient } = useWalletClient();
  const x402 = useX402Payment();
  const [buttonStatus, setButtonStatus] = useState<PaymentButtonStatus>('idle');

  const handleClick = useCallback(async () => {
    if (!walletClient) {
      const err = new Error('Please connect your wallet first.');
      onError?.(err);
      return;
    }

    // Confirm step
    if (buttonStatus === 'idle') {
      setButtonStatus('confirming');
      return;
    }

    // Actual payment
    if (buttonStatus === 'confirming') {
      try {
        setButtonStatus('signing');
        const receipt = await x402.pay(endpoint);
        setButtonStatus('success');
        if (receipt) {
          onSuccess?.(receipt);
        }
      } catch (err) {
        setButtonStatus('error');
        const error = err instanceof Error ? err : new Error('Payment failed.');
        onError?.(error);
      }
    }
  }, [walletClient, buttonStatus, endpoint, onSuccess, onError, x402]);

  const handleReset = useCallback(() => {
    setButtonStatus('idle');
    x402.reset();
  }, [x402]);

  // Derive the displayed price from the endpoint path
  const priceLookup: Record<string, string> = {
    '/api/skills/premium': '5000',
    '/api/deploy/usdc': '10000000',
    '/api/analytics/pro': '10000',
    '/api/v1': '1000',
  };

  // Match prefix for price display
  let priceDisplay = '';
  for (const [prefix, amount] of Object.entries(priceLookup)) {
    const urlPath = (() => {
      try {
        return new URL(endpoint, 'http://localhost').pathname;
      } catch {
        return endpoint;
      }
    })();

    if (urlPath === prefix || urlPath.startsWith(`${prefix}/`)) {
      priceDisplay = formatUsdcPrice(amount);
      break;
    }
  }

  const isLoading =
    buttonStatus === 'signing' || buttonStatus === 'verifying' || x402.isLoading;
  const isDisabled = isLoading || !walletClient;

  return (
    <div className="inline-flex flex-col gap-1">
      {buttonStatus === 'error' ? (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          <span>Payment Failed</span>
          <span className="text-xs">(Click to retry)</span>
        </button>
      ) : buttonStatus === 'success' ? (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Payment Complete</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={isDisabled}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <Spinner />
          ) : (
            <UsdcIcon className="h-4 w-4" />
          )}

          {buttonStatus === 'confirming' ? (
            <span>
              Confirm {priceDisplay ? `${priceDisplay} USDC` : 'payment'}?
            </span>
          ) : isLoading ? (
            <span>
              {buttonStatus === 'signing' ? 'Signing...' : 'Verifying...'}
            </span>
          ) : (
            <span>{children ?? `Pay ${priceDisplay ? `${priceDisplay} USDC` : 'with USDC'}`}</span>
          )}
        </button>
      )}

      {!walletClient && buttonStatus === 'idle' && (
        <span className="text-xs text-gray-500">Connect wallet to pay</span>
      )}
    </div>
  );
}
