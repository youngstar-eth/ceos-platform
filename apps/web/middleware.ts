import { NextRequest, NextResponse } from 'next/server';

import {
  buildPaymentRequirements,
  getRoutePrice,
  X402_ROUTE_PREFIXES,
} from '@/lib/x402-config';

/**
 * x402 Payment Middleware
 *
 * Intercepts requests to x402-gated routes and enforces the HTTP 402 payment flow:
 *
 * 1. If the route has no price entry, pass through.
 * 2. If no `X-PAYMENT` header is present, respond with 402 + payment requirements.
 * 3. If `X-PAYMENT` header is present, verify the payment with the facilitator.
 * 4. On success, forward the request with verification headers.
 */

interface FacilitatorVerifyResponse {
  valid: boolean;
  payer?: string;
  amount?: string;
  error?: string;
}

async function verifyPaymentWithFacilitator(
  paymentHeader: string,
  facilitatorUrl: string
): Promise<FacilitatorVerifyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment: paymentHeader }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { valid: false, error: `Facilitator returned ${response.status}` };
    }

    const data: unknown = await response.json();
    if (
      typeof data === 'object' &&
      data !== null &&
      'valid' in data &&
      typeof (data as Record<string, unknown>).valid === 'boolean'
    ) {
      return data as FacilitatorVerifyResponse;
    }

    return { valid: false, error: 'Invalid facilitator response shape' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown verification error';
    return { valid: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Check if this route is x402-gated
  const price = getRoutePrice(pathname);
  if (price === null) {
    return NextResponse.next();
  }

  // Build payment requirements for the 402 response
  const resourceUrl = request.nextUrl.toString();
  const requirements = buildPaymentRequirements(pathname, resourceUrl);
  if (!requirements) {
    return NextResponse.next();
  }

  const paymentHeader = request.headers.get('X-PAYMENT');

  // No payment header → 402 Payment Required
  if (!paymentHeader) {
    const response = new NextResponse(
      JSON.stringify({
        success: false,
        error: {
          code: 'PAYMENT_REQUIRED',
          message: `This endpoint requires a payment of ${requirements.maxAmountRequired} USDC micro-units.`,
        },
      }),
      {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    response.headers.set('X-PAYMENT-REQUIRED', JSON.stringify(requirements));
    return response;
  }

  // Verify payment with the Coinbase CDP facilitator
  const verification = await verifyPaymentWithFacilitator(
    paymentHeader,
    requirements.facilitatorUrl
  );

  if (!verification.valid) {
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: {
          code: 'PAYMENT_INVALID',
          message: verification.error ?? 'Payment verification failed.',
        },
      }),
      {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Payment verified — forward request with verification headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-PAYMENT-VERIFIED', 'true');
  requestHeaders.set('X-PAYMENT-PAYER', verification.payer ?? '');
  requestHeaders.set('X-PAYMENT-AMOUNT', verification.amount ?? price.toString());

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

/**
 * Middleware route matcher.
 *
 * Only runs on x402-gated route prefixes to avoid unnecessary overhead.
 */
export const config = {
  matcher: X402_ROUTE_PREFIXES.map((prefix) => `${prefix}/:path*`),
};
