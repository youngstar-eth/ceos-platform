import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

type Handler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

/**
 * Wrap API route handlers with standardized error handling.
 *
 * Catches unhandled exceptions and returns a consistent JSON error
 * response instead of letting Next.js generate an HTML 500 page.
 */
export function apiHandler(handler: Handler): Handler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred';

      logger.error({
        method: request.method,
        url: request.nextUrl.pathname,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Unhandled API error');

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message:
              process.env.NODE_ENV === 'production'
                ? 'An unexpected error occurred'
                : message,
          },
        },
        { status: 500 },
      );
    }
  };
}
