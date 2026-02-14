import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Query Schema
// ---------------------------------------------------------------------------

const receiptsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/x402/receipts
 *
 * Retrieve paginated payment receipt history.
 *
 * The payer address is extracted from the `X-PAYMENT-PAYER` header
 * (set by the x402 middleware after payment verification) or from
 * a query parameter for authenticated requests.
 *
 * Query parameters:
 *   - page (number, default: 1)
 *   - limit (number, default: 20, max: 100)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Extract payer address from header or query
    const payerFromHeader = request.headers.get('X-PAYMENT-PAYER');
    const payerFromQuery = request.nextUrl.searchParams.get('payer');
    const payer = payerFromHeader ?? payerFromQuery;

    if (!payer || !/^0x[a-fA-F0-9]{40}$/.test(payer)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message:
              'Missing or invalid payer address. Provide via X-PAYMENT-PAYER header or ?payer= query parameter.',
          },
        },
        { status: 401 }
      );
    }

    // Parse pagination
    const queryParams = {
      page: request.nextUrl.searchParams.get('page') ?? '1',
      limit: request.nextUrl.searchParams.get('limit') ?? '20',
    };

    const parsed = receiptsQuerySchema.safeParse(queryParams);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid pagination parameters.',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const [receipts, total] = await Promise.all([
      prisma.x402Payment.findMany({
        where: { payer: payer.toLowerCase() },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.x402Payment.count({
        where: { payer: payer.toLowerCase() },
      }),
    ]);

    const data = receipts.map((r) => ({
      id: r.id,
      payer: r.payer,
      payee: r.payee ?? '',
      amount: r.amount.toString(),
      signature: r.signature ?? '',
      txHash: r.txHash,
      chainId: r.chainId ?? 8453,
      network: r.network ?? 'base',
      resource: r.endpoint,
      verifiedAt: r.verifiedAt?.toISOString() ?? r.createdAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(
      {
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
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
