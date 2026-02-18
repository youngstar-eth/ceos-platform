import { NextResponse } from "next/server";
import type { ApiResponse, ApiError, PaginatedResponse } from "@ceosrun/shared/types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Build a successful JSON response.
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data } as ApiResponse<T>, { status });
}

/**
 * Build a paginated JSON response.
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number },
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json(
    { success: true, data, pagination } as PaginatedResponse<T>,
    { status: 200 },
  );
}

/** Fields that must NEVER be sent to the client. */
const SENSITIVE_AGENT_FIELDS = [
  'cdpWalletData',
  'signerUuid',
] as const;

/**
 * Strip sensitive fields from an agent (or array of agents) before responding.
 * Works with plain agent objects and agents with relations (casts, identity, etc.).
 */
export function sanitizeAgent<T extends Record<string, unknown>>(agent: T): Omit<T, (typeof SENSITIVE_AGENT_FIELDS)[number]> {
  const sanitized = { ...agent };
  for (const field of SENSITIVE_AGENT_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

export function sanitizeAgents<T extends Record<string, unknown>>(agents: T[]): Omit<T, (typeof SENSITIVE_AGENT_FIELDS)[number]>[] {
  return agents.map(sanitizeAgent);
}

/**
 * Build an error JSON response from an AppError or unknown error.
 */
export function errorResponse(err: unknown): NextResponse<ApiError> {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, message: err.message }, "AppError");
    return NextResponse.json(err.toJSON(), { status: err.statusCode });
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error({ err }, "Unhandled error in API route");

  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message },
    } as ApiError,
    { status: 500 },
  );
}
