import { type Address } from 'viem';

/**
 * Payment requirements returned by an x402-enabled endpoint
 * when it responds with HTTP 402 Payment Required.
 */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra?: Record<string, unknown>;
}

/**
 * Payment receipt to attach to subsequent requests
 * after completing the USDC payment.
 */
export interface PaymentReceipt {
  payload: string;
  signature: string;
}

/**
 * Checks whether a given URL is a known x402 payment-gated endpoint.
 */
export function isX402Endpoint(url: string): boolean {
  const x402Patterns = ['/api/x402/', '/api/skills/premium/'];
  return x402Patterns.some((pattern) => url.includes(pattern));
}

/**
 * Parse x402 payment requirements from a 402 response.
 */
export function parsePaymentRequirements(
  response: Response
): PaymentRequirements | null {
  const header = response.headers.get('X-Payment');
  if (!header) return null;

  try {
    return JSON.parse(header) as PaymentRequirements;
  } catch {
    return null;
  }
}

/**
 * Wraps the standard fetch API to transparently handle x402 payment flows.
 *
 * 1. Initial request to the protected endpoint
 * 2. If 402 is returned, parse payment requirements
 * 3. Execute payment (caller provides the pay function)
 * 4. Retry the request with the payment receipt
 */
export async function x402Fetch(
  url: string,
  options: RequestInit = {},
  onPaymentRequired?: (
    requirements: PaymentRequirements
  ) => Promise<PaymentReceipt | null>
): Promise<Response> {
  const response = await fetch(url, options);

  if (response.status !== 402) {
    return response;
  }

  const requirements = parsePaymentRequirements(response);
  if (!requirements || !onPaymentRequired) {
    return response;
  }

  const receipt = await onPaymentRequired(requirements);
  if (!receipt) {
    return response;
  }

  // Retry the request with the payment proof
  const retryHeaders = new Headers(options.headers);
  retryHeaders.set('X-Payment-Response', JSON.stringify(receipt));

  return fetch(url, {
    ...options,
    headers: retryHeaders,
  });
}

/**
 * Format USDC amount from smallest unit (6 decimals) to display string.
 */
export function formatX402Amount(amountRaw: string): string {
  const amount = Number(amountRaw) / 1e6;
  return `$${amount.toFixed(2)} USDC`;
}
