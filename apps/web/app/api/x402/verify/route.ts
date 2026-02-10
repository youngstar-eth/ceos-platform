import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import { verifyPaymentSchema } from "@/lib/validation";
import { env } from "@/lib/env";

/**
 * POST /api/x402/verify
 *
 * Verify an x402 payment by forwarding the payment header
 * to the Coinbase CDP facilitator for on-chain verification.
 *
 * Flow:
 * 1. Parse payment header & endpoint
 * 2. Call facilitator to verify USDC payment on Base
 * 3. Store payment record
 * 4. Return verification result
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    const body: unknown = await request.json();
    const { endpoint, paymentHeader } = verifyPaymentSchema.parse(body);

    // Call the x402 facilitator to verify the payment
    const facilitatorUrl = env.X402_FACILITATOR_URL;
    const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentHeader,
        endpoint,
        resourceWallet: env.X402_RESOURCE_WALLET,
      }),
    });

    if (!verifyResponse.ok) {
      const errorBody = await verifyResponse.text();
      logger.warn({ endpoint, error: errorBody }, "x402 verification failed at facilitator");
      throw Errors.paymentRequired("Payment verification failed");
    }

    const result = (await verifyResponse.json()) as {
      valid: boolean;
      amount: string;
      payer: string;
      txHash?: string;
    };

    if (!result.valid) {
      throw Errors.paymentRequired("Invalid payment");
    }

    // Store the payment record
    const payment = await prisma.x402Payment.create({
      data: {
        endpoint,
        amount: BigInt(result.amount),
        payer: result.payer,
        txHash: result.txHash ?? null,
      },
    });

    logger.info(
      { paymentId: payment.id, payer: result.payer, amount: result.amount },
      "x402 payment verified and recorded",
    );

    return successResponse({
      verified: true,
      paymentId: payment.id,
      amount: result.amount,
      payer: result.payer,
      txHash: result.txHash ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
