import type { WalletClient } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';

/**
 * x402 Client Library
 *
 * Provides the client-side fetch wrapper that implements the x402 HTTP payment flow:
 * 1. Make initial request
 * 2. If 402, extract payment requirements from header
 * 3. Sign USDC payment via EIP-3009 (transferWithAuthorization)
 * 4. Retry request with X-PAYMENT header
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentRequirements {
  readonly scheme: 'x402';
  readonly network: string;
  readonly maxAmountRequired: string;
  readonly resource: string;
  readonly description: string;
  readonly usdcContract: string;
  readonly payTo: string;
  readonly facilitatorUrl: string;
  readonly chainId: number;
}

export interface PaymentReceipt {
  readonly payer: string;
  readonly payee: string;
  readonly amount: string;
  readonly resource: string;
  readonly timestamp: number;
  readonly signature: string;
  readonly txHash?: string;
}

export interface X402PaymentCallbacks {
  /** Called when payment requirements are received from the server. */
  onPaymentRequired?: (requirements: PaymentRequirements) => void;
  /** Called after the wallet signs the payment. */
  onPaymentSigned?: () => void;
  /** Called when the payment is verified and request succeeds. */
  onPaymentComplete?: (receipt: PaymentReceipt) => void;
  /** Called on any error during the payment flow. */
  onError?: (error: Error) => void;
}

export interface X402FetchOptions extends Omit<RequestInit, 'signal'> {
  /** The connected wagmi wallet client used to sign USDC authorizations. */
  walletClient: WalletClient;
  /** Optional lifecycle callbacks. */
  callbacks?: X402PaymentCallbacks;
  /** Request timeout in milliseconds. Defaults to 30 000. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;

/** EIP-3009 transferWithAuthorization ABI fragment (USDC). */
const TRANSFER_WITH_AUTHORIZATION_ABI = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
]);

/** EIP-712 domain for USDC on Base. */
function buildUsdcDomain(usdcContract: string, chainId: number) {
  return {
    name: 'USD Coin',
    version: '2',
    chainId: BigInt(chainId),
    verifyingContract: usdcContract as `0x${string}`,
  } as const;
}

/** EIP-3009 TransferWithAuthorization typed data types. */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `X-PAYMENT-REQUIRED` header value into a typed object.
 *
 * @throws {Error} If the header cannot be parsed or is missing required fields.
 */
export function parsePaymentHeader(header: string): PaymentRequirements {
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    throw new Error('[x402] Failed to parse X-PAYMENT-REQUIRED header as JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('[x402] X-PAYMENT-REQUIRED header is not a valid object.');
  }

  const obj = parsed as Record<string, unknown>;

  const requiredFields: Array<keyof PaymentRequirements> = [
    'scheme',
    'network',
    'maxAmountRequired',
    'resource',
    'description',
    'usdcContract',
    'payTo',
    'facilitatorUrl',
    'chainId',
  ];

  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new Error(`[x402] Missing required field "${field}" in payment header.`);
    }
  }

  return {
    scheme: obj.scheme as 'x402',
    network: String(obj.network),
    maxAmountRequired: String(obj.maxAmountRequired),
    resource: String(obj.resource),
    description: String(obj.description),
    usdcContract: String(obj.usdcContract),
    payTo: String(obj.payTo),
    facilitatorUrl: String(obj.facilitatorUrl),
    chainId: Number(obj.chainId),
  };
}

/**
 * Check if a URL matches a known x402 route prefix.
 */
export function isX402Endpoint(url: string): boolean {
  const X402_PREFIXES = [
    '/api/skills/premium',
    '/api/deploy/usdc',
    '/api/analytics/pro',
    '/api/v1',
  ];

  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return false;
  }

  return X402_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Generate a random bytes32 nonce for EIP-3009.
 */
function generateNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Sign Payment
// ---------------------------------------------------------------------------

/**
 * Sign a USDC transferWithAuthorization (EIP-3009) for the given requirements.
 *
 * @returns A payment object that can be serialised as the `X-PAYMENT` header.
 */
export async function signPayment(
  walletClient: WalletClient,
  requirements: PaymentRequirements
): Promise<{
  signature: string;
  payload: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
  calldata: string;
}> {
  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error('[x402] No connected account found in wallet client.');
  }

  const nonce = generateNonce();
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60); // 1 minute ago to account for clock skew
  const validBefore = BigInt(now + 3600); // 1 hour from now
  const value = BigInt(requirements.maxAmountRequired);

  const domain = buildUsdcDomain(requirements.usdcContract, requirements.chainId);

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account,
      to: requirements.payTo as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
    },
  });

  // Encode calldata for the facilitator to submit on-chain
  const calldata = encodeFunctionData({
    abi: TRANSFER_WITH_AUTHORIZATION_ABI,
    functionName: 'transferWithAuthorization',
    args: [
      account,
      requirements.payTo as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
      0, // v placeholder — the facilitator reconstructs from the signature
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    ],
  });

  return {
    signature,
    payload: {
      from: account,
      to: requirements.payTo,
      value: value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
    calldata,
  };
}

// ---------------------------------------------------------------------------
// x402Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch wrapper that automatically handles the x402 payment flow.
 *
 * 1. Sends the initial request.
 * 2. If a 402 is returned, extracts payment requirements.
 * 3. Signs the payment using the connected wallet.
 * 4. Retries the request with the `X-PAYMENT` header.
 *
 * @returns The final `Response` (either from the initial non-402 or the paid retry).
 */
export async function x402Fetch(
  url: string,
  options: X402FetchOptions
): Promise<Response> {
  const { walletClient, callbacks, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Step 1: initial request
    const initialResponse = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    });

    // Not a 402 → return as-is
    if (initialResponse.status !== 402) {
      return initialResponse;
    }

    // Step 2: extract payment requirements
    const paymentRequiredHeader = initialResponse.headers.get('X-PAYMENT-REQUIRED');
    if (!paymentRequiredHeader) {
      throw new Error(
        '[x402] Received 402 but no X-PAYMENT-REQUIRED header was present.'
      );
    }

    const requirements = parsePaymentHeader(paymentRequiredHeader);
    callbacks?.onPaymentRequired?.(requirements);

    // Step 3: sign payment
    const payment = await signPayment(walletClient, requirements);
    callbacks?.onPaymentSigned?.();

    // Step 4: retry with payment header
    const paymentHeaderValue = JSON.stringify({
      signature: payment.signature,
      payload: payment.payload,
      calldata: payment.calldata,
    });

    const retryResponse = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
      headers: {
        ...fetchInit.headers,
        'X-PAYMENT': paymentHeaderValue,
      },
    });

    // If the retry also fails, surface the error
    if (retryResponse.status === 402) {
      throw new Error(
        '[x402] Payment was rejected by the server after signing.'
      );
    }

    // Notify success
    const receipt: PaymentReceipt = {
      payer: payment.payload.from,
      payee: payment.payload.to,
      amount: payment.payload.value,
      resource: requirements.resource,
      timestamp: Math.floor(Date.now() / 1000),
      signature: payment.signature,
    };
    callbacks?.onPaymentComplete?.(receipt);

    return retryResponse;
  } catch (err) {
    const error =
      err instanceof Error ? err : new Error('[x402] Unknown error during payment flow.');
    callbacks?.onError?.(error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
