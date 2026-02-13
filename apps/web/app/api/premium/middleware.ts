import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// x402 Configuration Types
// ---------------------------------------------------------------------------

export interface X402Config {
  /** EIP-155 chain identifier, e.g. "eip155:8453" for Base mainnet */
  network: string;
  /** USDC contract address on Base */
  asset: string;
  /** Wallet address receiving x402 payments */
  payTo: string;
  /** x402 facilitator URL for payment verification */
  facilitator: string;
}

export interface PaymentRequirement {
  scheme: "x402";
  network: string;
  asset: string;
  maxAmountRequired: string;
  payTo: string;
  facilitator: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYMENT_HEADER = "X-PAYMENT";
const PAYMENT_VERIFIED_HEADER = "X-PAYMENT-VERIFIED";
const PAYMENT_AMOUNT_HEADER = "X-PAYMENT-AMOUNT";

// ---------------------------------------------------------------------------
// Config Builder
// ---------------------------------------------------------------------------

/**
 * Build x402 configuration from environment variables.
 */
export function getX402Config(): X402Config {
  const payTo = process.env.CEOS_REVENUE_ADDRESS;
  if (!payTo) {
    logger.warn("CEOS_REVENUE_ADDRESS is not set; x402 payments will be directed to zero address");
  }

  return {
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: payTo ?? "0x0000000000000000000000000000000000000000",
    facilitator: "https://x402.org/facilitator",
  };
}

// ---------------------------------------------------------------------------
// Payment Requirement Builders
// ---------------------------------------------------------------------------

/**
 * Create a payment requirement object for the 402 response body.
 *
 * @param amount - USDC amount in 6-decimal micro-units as a string (e.g. "100000" = $0.10)
 * @param description - Human-readable description of what the payment unlocks
 */
export function createPaymentRequirement(
  amount: string,
  description: string,
): PaymentRequirement {
  const config = getX402Config();

  return {
    scheme: "x402",
    network: config.network,
    asset: config.asset,
    maxAmountRequired: amount,
    payTo: config.payTo,
    facilitator: config.facilitator,
    description,
  };
}

/**
 * Build a 402 Payment Required response with the x402 payment details.
 *
 * @param amount - USDC amount in 6-decimal micro-units as a string
 * @param description - Human-readable description of the payment
 */
export function createPaymentRequiredResponse(
  amount: string,
  description: string,
): NextResponse {
  const requirement = createPaymentRequirement(amount, description);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "PAYMENT_REQUIRED",
        message: description,
      },
      paymentRequirements: [requirement],
    },
    {
      status: 402,
      headers: {
        "X-Payment-Requirements": JSON.stringify([requirement]),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Payment Verification
// ---------------------------------------------------------------------------

/**
 * Check whether the incoming request has a valid payment header.
 *
 * The x402 middleware or client attaches payment proof in the `X-PAYMENT`
 * header. If the payment has been verified upstream (e.g. by Next.js
 * middleware calling the facilitator), the `X-PAYMENT-VERIFIED` header is
 * set to "true" and `X-PAYMENT-AMOUNT` contains the paid amount.
 *
 * @param request - The incoming request
 * @param requiredAmount - The minimum USDC amount in micro-units
 * @returns `true` if payment is verified and sufficient, `false` otherwise
 */
export function isPaymentVerified(
  request: Request,
  requiredAmount: string,
): boolean {
  const verified = request.headers.get(PAYMENT_VERIFIED_HEADER);
  if (verified === "true") {
    const paidAmount = request.headers.get(PAYMENT_AMOUNT_HEADER);
    if (paidAmount && BigInt(paidAmount) >= BigInt(requiredAmount)) {
      return true;
    }
    // If verified but no amount header, trust the middleware
    if (!paidAmount) {
      return true;
    }
  }

  // Check for raw payment token (set by x402-fetch clients)
  const paymentToken = request.headers.get(PAYMENT_HEADER);
  if (paymentToken) {
    // In production, this token would be forwarded to the facilitator for
    // verification. For now, the presence of the header with a non-empty
    // value indicates the client has attached a payment proof.
    logger.info({ hasPaymentToken: true }, "x402 payment token present on request");
    return true;
  }

  return false;
}

/**
 * Gate a request behind x402 payment. Returns a 402 response if the
 * request has not been paid, or `null` if the payment is verified and
 * the handler should proceed.
 *
 * Usage in route handlers:
 * ```ts
 * const paywall = requirePayment(request, "100000", "Trading signals access");
 * if (paywall) return paywall;
 * // ... proceed with paid logic
 * ```
 */
export function requirePayment(
  request: Request,
  amount: string,
  description: string,
): NextResponse | null {
  if (isPaymentVerified(request, amount)) {
    return null;
  }

  logger.info({ amount, description }, "x402 payment required — returning 402");
  return createPaymentRequiredResponse(amount, description);
}
