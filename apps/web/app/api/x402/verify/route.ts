import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { X402_CONFIG } from '@/lib/x402-config';

// ---------------------------------------------------------------------------
// Request Schema
// ---------------------------------------------------------------------------

const verifyPaymentSchema = z.object({
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FacilitatorResponse {
  valid: boolean;
  txHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Forward the payment to the Coinbase CDP facilitator for on-chain verification.
 */
async function verifyWithFacilitator(
  paymentData: z.infer<typeof verifyPaymentSchema>
): Promise<FacilitatorResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

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
    if (
      typeof data === 'object' &&
      data !== null &&
      'valid' in data
    ) {
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

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/x402/verify
 *
 * Verify an x402 payment receipt.
 *
 * 1. Validate the request body with Zod.
 * 2. Forward to the Coinbase CDP facilitator.
 * 3. On success, persist the receipt to the database (X402Payment model).
 * 4. Return the verification result.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = verifyPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payment data.',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const paymentData = parsed.data;

    // Verify with the facilitator
    const verification = await verifyWithFacilitator(paymentData);

    if (!verification.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PAYMENT_INVALID',
            message: verification.error ?? 'Payment verification failed.',
          },
        },
        { status: 400 }
      );
    }

    // Store payment receipt in database
    // In production this uses Prisma; here we build the record structure.
    const paymentRecord = {
      payer: paymentData.payload.from,
      payee: paymentData.payload.to,
      amount: paymentData.payload.value,
      signature: paymentData.signature,
      txHash: verification.txHash ?? null,
      chainId: X402_CONFIG.chainId,
      network: X402_CONFIG.network,
      usdcContract: X402_CONFIG.usdcContract,
      nonce: paymentData.payload.nonce,
      validAfter: paymentData.payload.validAfter,
      validBefore: paymentData.payload.validBefore,
      verifiedAt: new Date().toISOString(),
    };

    // TODO: Persist with Prisma once the X402Payment model is added to schema.prisma
    // await prisma.x402Payment.create({ data: paymentRecord });

    return NextResponse.json(
      {
        success: true,
        data: {
          valid: true,
          txHash: verification.txHash ?? null,
          payment: paymentRecord,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
