/**
 * x402 Service-Side Payment Verification
 *
 * Server-side helper that encapsulates the Coinbase CDP facilitator
 * verification flow. Extracted from /api/x402/verify/route.ts for
 * reuse by any API route that needs to verify x402 payments — most
 * critically, the service job creation flow.
 *
 * Flow:
 *   1. Parse the X-PAYMENT header (JSON) from the incoming request
 *   2. Validate the payment structure with Zod
 *   3. Forward to the CDP facilitator for on-chain verification
 *   4. Persist the verified receipt to the X402Payment table
 *   5. Return { txHash } on success or throw on failure
 *
 * This module is the canonical "Pay-Before-Create" gate: no job is
 * created unless the USDC has been verified on-chain.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { X402_CONFIG } from '@/lib/x402-config';
import { logger } from '@/lib/logger';

// ── Schemas ──────────────────────────────────────────────────────────────────

/** Zod schema for the X-PAYMENT header payload (matches signPayment output). */
const x402PaymentSchema = z.object({
  signature: z.string().min(1, 'Signature is required.'),
  payload: z.object({
    from: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid payer address.'),
    to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid payee address.'),
    value: z.string().min(1, 'Value is required.'),
    validAfter: z.string(),
    validBefore: z.string(),
    nonce: z.string(),
  }),
  calldata: z.string().optional(),
});

export type X402PaymentData = z.infer<typeof x402PaymentSchema>;

// ── Types ────────────────────────────────────────────────────────────────────

interface FacilitatorResponse {
  valid: boolean;
  txHash?: string;
  error?: string;
}

export interface VerifiedPayment {
  txHash: string | null;
  payer: string;
  payee: string;
  amount: bigint;
}

// ── Facilitator Client ───────────────────────────────────────────────────────

const FACILITATOR_TIMEOUT_MS = 15_000;

/**
 * Forward a signed x402 payment to the Coinbase CDP facilitator for
 * on-chain verification and settlement.
 *
 * The facilitator submits the EIP-3009 transferWithAuthorization tx
 * on Base and returns { valid: true, txHash } on success.
 */
async function verifyWithFacilitator(
  paymentData: X402PaymentData,
): Promise<FacilitatorResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FACILITATOR_TIMEOUT_MS);

  try {
    const response = await fetch(`${X402_CONFIG.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment: {
          signature: paymentData.signature,
          payload: paymentData.payload,
          calldata: paymentData.calldata,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Facilitator returned status ${response.status}`,
      };
    }

    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'valid' in data) {
      return data as FacilitatorResponse;
    }

    return { valid: false, error: 'Unexpected facilitator response format.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown facilitator error.';
    return { valid: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse and validate the X-PAYMENT header from an incoming request.
 *
 * @returns The validated payment data, or null if no header is present.
 * @throws {Error} If the header is present but malformed.
 */
export function parseX402Header(request: Request): X402PaymentData | null {
  const raw = request.headers.get('x-payment');
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('[x402] Malformed X-PAYMENT header — invalid JSON.');
  }

  const result = x402PaymentSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[x402] Invalid X-PAYMENT header: ${issues}`);
  }

  return result.data;
}

/**
 * Verify an x402 service payment: validate the signed USDC transfer
 * via the CDP facilitator and persist the receipt.
 *
 * This is the "Pay-Before-Create" gate. Call this BEFORE creating
 * the ServiceJob record. On success, inject the returned txHash
 * into the job's `paymentTxHash` field.
 *
 * @param paymentData - Parsed X-PAYMENT header data
 * @param expectedAmount - The offering's priceUsdc (BigInt, 6 decimals)
 * @param endpoint - The API route recording this payment (e.g., "/api/services/jobs")
 * @returns VerifiedPayment with txHash, payer, payee, amount
 * @throws {Error} If payment amount is insufficient or facilitator rejects
 */
export async function verifyServicePayment(
  paymentData: X402PaymentData,
  expectedAmount: bigint,
  endpoint: string,
): Promise<VerifiedPayment> {
  const paidAmount = BigInt(paymentData.payload.value);

  // Gate: paid amount must cover the offering price
  if (paidAmount < expectedAmount) {
    throw new Error(
      `[x402] Insufficient payment: paid ${paidAmount.toString()} but offering requires ${expectedAmount.toString()} (USDC micro-units).`,
    );
  }

  // Forward to Coinbase CDP facilitator for on-chain settlement
  const verification = await verifyWithFacilitator(paymentData);

  if (!verification.valid) {
    throw new Error(
      `[x402] Payment verification failed: ${verification.error ?? 'Unknown reason.'}`,
    );
  }

  // Persist the verified payment receipt
  try {
    await prisma.x402Payment.create({
      data: {
        endpoint,
        amount: paidAmount,
        payer: paymentData.payload.from.toLowerCase(),
        payee: paymentData.payload.to,
        signature: paymentData.signature,
        txHash: verification.txHash ?? null,
        chainId: X402_CONFIG.chainId,
        network: X402_CONFIG.network,
        verifiedAt: new Date(),
      },
    });
  } catch (err) {
    // Log but don't fail — the USDC has already been transferred on-chain.
    // The payment record is for auditability, not a hard dependency.
    logger.error(
      { error: err instanceof Error ? err.message : String(err), endpoint },
      'Failed to persist x402 payment receipt (payment was still valid)',
    );
  }

  logger.info(
    {
      txHash: verification.txHash,
      payer: paymentData.payload.from,
      amount: paidAmount.toString(),
      endpoint,
    },
    'x402 service payment verified',
  );

  return {
    txHash: verification.txHash ?? null,
    payer: paymentData.payload.from,
    payee: paymentData.payload.to,
    amount: paidAmount,
  };
}
