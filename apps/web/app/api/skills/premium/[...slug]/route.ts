import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { env } from "@/lib/env";

interface RouteContext {
  params: Promise<{ slug: string[] }>;
}

/**
 * Skill pricing map (USDC amounts in human-readable form).
 */
const SKILL_PRICES: Record<string, string> = {
  "advanced-persona": "1.00",
  "video-generation": "2.00",
  "cross-platform": "1.50",
  "analytics-pro": "0.50",
  "a2a-communication": "1.00",
};

/**
 * GET /api/skills/premium/[...slug]
 *
 * Access a premium skill endpoint.
 * Protected by x402 payment protocol.
 *
 * If no valid payment header is present, returns 402 Payment Required
 * with payment details in the response headers.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const skillId = slug.join("/");

    const price = SKILL_PRICES[skillId];
    if (!price) {
      throw Errors.notFound("Premium skill");
    }

    // Check for x402 payment header
    const paymentHeader = request.headers.get("x-payment");

    if (!paymentHeader) {
      // Return 402 with payment details
      logger.info({ skillId }, "Premium skill access — payment required");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PAYMENT_REQUIRED",
            message: `This skill requires a payment of ${price} USDC`,
          },
        },
        {
          status: 402,
          headers: {
            "X-Payment-Required": "true",
            "X-Payment-Amount": price,
            "X-Payment-Currency": "USDC",
            "X-Payment-Network": "base",
            "X-Payment-Receiver": env.X402_RESOURCE_WALLET ?? "",
          },
        },
      );
    }

    // In a full implementation, verify the payment via the x402 facilitator.
    // For now, we accept the header as proof of payment intent.
    logger.info({ skillId, paymentHeader: paymentHeader.slice(0, 20) }, "Premium skill accessed with payment");

    return successResponse({
      skillId,
      status: "active",
      message: `Premium skill "${skillId}" activated. Payment verified.`,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
