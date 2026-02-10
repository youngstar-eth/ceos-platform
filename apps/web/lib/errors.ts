/**
 * Standard application error with HTTP status code.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Serialize to the standard API error shape.
   */
  toJSON(): { success: false; error: { code: string; message: string } } {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Predefined errors
// ---------------------------------------------------------------------------

export const Errors = {
  notFound: (resource: string) =>
    new AppError("NOT_FOUND", `${resource} not found`, 404),

  badRequest: (message: string) =>
    new AppError("BAD_REQUEST", message, 400),

  unauthorized: (message: string = "Unauthorized") =>
    new AppError("UNAUTHORIZED", message, 401),

  forbidden: (message: string = "Forbidden") =>
    new AppError("FORBIDDEN", message, 403),

  conflict: (message: string) =>
    new AppError("CONFLICT", message, 409),

  rateLimited: () =>
    new AppError("RATE_LIMITED", "Too many requests", 429),

  internal: (message: string = "Internal server error") =>
    new AppError("INTERNAL_ERROR", message, 500),

  validationFailed: (message: string) =>
    new AppError("VALIDATION_ERROR", message, 422),

  paymentRequired: (message: string = "Payment required") =>
    new AppError("PAYMENT_REQUIRED", message, 402),
} as const;
