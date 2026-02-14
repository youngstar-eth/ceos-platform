import { type NextRequest, NextResponse } from 'next/server';
import { type ZodSchema, ZodError } from 'zod';

/**
 * Parse and validate the JSON body of an incoming request.
 *
 * Returns the validated data on success, or a 400 NextResponse on failure.
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
): Promise<T | NextResponse> {
  try {
    const body: unknown = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON',
        },
      },
      { status: 400 },
    );
  }
}

/**
 * Type guard: check whether validateBody returned an error response.
 */
export function isValidationError<T>(result: T | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
