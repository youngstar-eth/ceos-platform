'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentStatusState = 'pending' | 'success' | 'error';

interface PaymentStatusProps {
  /** Current payment state. */
  status: PaymentStatusState;
  /** Transaction hash (shown on success with BaseScan link). */
  txHash?: string;
  /** Error message (shown on error). */
  errorMessage?: string;
  /** Called when the user clicks retry on an error state. */
  onRetry?: () => void;
  /** Optional custom class name for the wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// BaseScan link builder
// ---------------------------------------------------------------------------

const BASE_EXPLORER_URL = 'https://basescan.org';

function buildTxUrl(txHash: string): string {
  return `${BASE_EXPLORER_URL}/tx/${txHash}`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-blue-500"
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

function CheckIcon() {
  return (
    <svg
      className="h-5 w-5 text-green-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      className="h-5 w-5 text-red-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentStatus({
  status,
  txHash,
  errorMessage,
  onRetry,
  className,
}: PaymentStatusProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
        status === 'pending'
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : status === 'success'
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
      } ${className ?? ''}`}
    >
      {/* Icon */}
      {status === 'pending' && <SpinnerIcon />}
      {status === 'success' && <CheckIcon />}
      {status === 'error' && <ErrorIcon />}

      {/* Content */}
      <div className="flex flex-col gap-0.5">
        {status === 'pending' && (
          <span className="font-medium">Processing payment...</span>
        )}

        {status === 'success' && (
          <>
            <span className="font-medium">Payment successful</span>
            {txHash && (
              <a
                href={buildTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-600 underline hover:text-green-800"
              >
                View on BaseScan: {truncateHash(txHash)}
              </a>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <span className="font-medium">
              {errorMessage ?? 'Payment failed'}
            </span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1 inline-flex w-fit items-center gap-1 rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Retry
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
