import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logger } from "@/lib/logger";

/**
 * GET /api/health
 *
 * Health check endpoint. Verifies database connectivity and
 * returns basic service status.
 */
export async function GET(_request: NextRequest) {
  try {
    const start = Date.now();

    // Test database connectivity
    let dbStatus: "healthy" | "unhealthy" = "unhealthy";
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "healthy";
    } catch (dbErr) {
      logger.error({ err: dbErr }, "Database health check failed");
    }

    const latency = Date.now() - start;

    return successResponse({
      status: dbStatus === "healthy" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: dbStatus,
      },
      latency: `${latency}ms`,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
