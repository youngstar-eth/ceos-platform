import { NextRequest } from "next/server";
import { Prisma, ServiceJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { updateServiceJobSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ jobId: string }> };

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ── Buyback & Burn Stub ─────────────────────────────────────────────────────

/**
 * Queue a $RUN buyback-and-burn operation for the protocol fee.
 *
 * Phase 1 (current): Logs the buyback intent as a structured record
 *   on the ServiceJob itself (buybackTxHash field) and emits a structured
 *   log for downstream processing.
 *
 * Phase 2: Replace with BullMQ job that:
 *   1. Calls FeeSplitter.distributeUSDCFees(agentTreasury, buybackAmount)
 *   2. Triggers Uniswap V3 swap USDC → $RUN
 *   3. Burns $RUN to dead address
 *   4. Updates buybackTxHash with the actual on-chain tx
 *
 * @param jobId - The completed service job ID
 * @param feeAmountUsdc - The 2% protocol fee in USDC micro-units
 */
async function queueBuybackJob(
  jobId: string,
  feeAmountUsdc: bigint,
): Promise<void> {
  if (feeAmountUsdc === 0n) return;

  try {
    // Mark the job with a synthetic buyback hash to signal the fee was calculated.
    // Phase 2 will replace this with the real FeeSplitter transaction hash.
    const syntheticBuybackHash = `buyback-pending-${jobId}-${Date.now()}`;

    await prisma.serviceJob.update({
      where: { id: jobId },
      data: { buybackTxHash: syntheticBuybackHash },
    });

    logger.info(
      {
        jobId,
        feeAmountUsdc: feeAmountUsdc.toString(),
        buybackTxHash: syntheticBuybackHash,
        // Phase 2 routing targets (from FeeSplitter):
        // - 40% → Agent Treasury (growth reinvestment)
        // - 40% → Protocol Treasury ($RUN buyback & burn)
        // - 20% → Scout Fund (autonomous low-cap investment)
      },
      "Buyback & Burn fee allocation recorded — pending on-chain execution",
    );
  } catch (err) {
    // Log but don't fail the job completion — the fee record is for
    // auditability, and the actual buyback is a separate concern.
    logger.error(
      {
        jobId,
        feeAmountUsdc: feeAmountUsdc.toString(),
        error: err instanceof Error ? err.message : String(err),
      },
      "Failed to record buyback fee allocation (job completion unaffected)",
    );
  }
}

/**
 * Valid state transitions (seller-driven).
 *
 * DELIVERING → DISPUTED: Used by the autonomous executor when skill
 * execution fails or times out. Signals to the buyer that the seller
 * attempted fulfillment but encountered an error. The buyer can then
 * request a refund or re-negotiate via the dispute resolution flow.
 */
const VALID_TRANSITIONS: Record<ServiceJobStatus, ServiceJobStatus[]> = {
  CREATED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["DELIVERING"],
  DELIVERING: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  REJECTED: [],
  DISPUTED: [],
  EXPIRED: [],
};

/**
 * GET /api/services/jobs/[jobId]
 *
 * Fetch a single job. Caller must be buyer or seller creator.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);
    const { jobId } = await context.params;

    const job = await prisma.serviceJob.findUnique({
      where: { id: jobId },
      include: {
        offering: {
          include: {
            sellerAgent: {
              select: {
                id: true,
                name: true,
                pfpUrl: true,
                walletAddress: true,
                creatorAddress: true,
              },
            },
          },
        },
        buyerAgent: {
          select: {
            id: true,
            name: true,
            pfpUrl: true,
            walletAddress: true,
            creatorAddress: true,
          },
        },
        // Glass Box: include the latest decision log for provenance display
        decisionLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            modelUsed: true,
            tokensUsed: true,
            executionTimeMs: true,
            isSuccess: true,
            errorMessage: true,
            decisionLogHash: true,
            anchoredTxHash: true,
            anchoredAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!job) throw Errors.notFound("Service job");

    // Auth: must be buyer or seller creator (bypassed in DEMO_MODE)
    const isBuyerCreator = job.buyerAgent.creatorAddress === address;
    const isSellerCreator = job.offering.sellerAgent.creatorAddress === address;
    if (!DEMO_MODE && !isBuyerCreator && !isSellerCreator) {
      throw Errors.forbidden("Not authorized to view this job");
    }

    // Strip sensitive creatorAddress from response
    const { creatorAddress: _bc, ...buyerSafe } = job.buyerAgent;
    const { creatorAddress: _sc, ...sellerSafe } = job.offering.sellerAgent;

    // Glass Box: extract the latest decision log (if any) for the UI
    const latestDecisionLog = job.decisionLogs?.[0] ?? null;

    return successResponse({
      ...job,
      priceUsdc: job.priceUsdc.toString(),
      buyerAgent: buyerSafe,
      offering: { ...job.offering, sellerAgent: sellerSafe },
      // Glass Box provenance data — exposed to buyer/seller for transparency
      glassBox: latestDecisionLog
        ? {
            modelUsed: latestDecisionLog.modelUsed,
            tokensUsed: latestDecisionLog.tokensUsed,
            executionTimeMs: latestDecisionLog.executionTimeMs,
            isSuccess: latestDecisionLog.isSuccess,
            errorMessage: latestDecisionLog.errorMessage,
            decisionLogHash: latestDecisionLog.decisionLogHash,
            anchoredTxHash: latestDecisionLog.anchoredTxHash,
            anchoredAt: latestDecisionLog.anchoredAt,
            createdAt: latestDecisionLog.createdAt,
          }
        : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PATCH /api/services/jobs/[jobId]
 *
 * Transition job status. Only the seller agent's creator can transition.
 *
 * State machine:
 *   CREATED  → ACCEPTED | REJECTED
 *   ACCEPTED → DELIVERING
 *   DELIVERING → COMPLETED
 *   (COMPLETED, REJECTED, DISPUTED, EXPIRED are terminal)
 *
 * On COMPLETED: update offering stats (completedJobs, avgLatencyMs) in $transaction.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);
    const { jobId } = await context.params;

    const body: unknown = await request.json();
    const data = updateServiceJobSchema.parse(body);
    const newStatus = data.status as ServiceJobStatus;

    // Fetch job with offering + seller agent
    const job = await prisma.serviceJob.findUnique({
      where: { id: jobId },
      include: {
        offering: {
          include: {
            sellerAgent: { select: { creatorAddress: true } },
          },
        },
      },
    });

    if (!job) throw Errors.notFound("Service job");

    // Only seller creator can transition (bypassed in DEMO_MODE for executor)
    if (!DEMO_MODE && job.offering.sellerAgent.creatorAddress !== address) {
      throw Errors.forbidden("Only the seller agent's creator can update job status");
    }

    // Check job hasn't expired (unless rejecting)
    if (
      job.expiresAt < new Date() &&
      job.status !== "EXPIRED" &&
      newStatus !== "REJECTED"
    ) {
      throw Errors.conflict("Job has expired");
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw Errors.conflict(
        `Cannot transition from ${job.status} to ${newStatus}`,
      );
    }

    // Build update data with timestamps
    const updateData: Prisma.ServiceJobUpdateInput = {
      status: newStatus,
      ...(data.deliverables !== undefined && {
        deliverables: data.deliverables as Prisma.InputJsonValue,
      }),
    };

    if (newStatus === "ACCEPTED") {
      updateData.acceptedAt = new Date();
    } else if (newStatus === "DELIVERING") {
      updateData.deliveredAt = new Date();
    } else if (newStatus === "COMPLETED") {
      updateData.completedAt = new Date();
      updateData.deliverables =
        (data.deliverables as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }

    if (newStatus === "COMPLETED") {
      // Atomic update: job + offering stats in transaction
      const latencyMs = Math.round(
        Date.now() - (job.acceptedAt?.getTime() ?? job.createdAt.getTime()),
      );

      const [updatedJob] = await prisma.$transaction([
        prisma.serviceJob.update({
          where: { id: jobId },
          data: updateData,
          include: {
            offering: { select: { slug: true, name: true, category: true } },
            buyerAgent: { select: { id: true, name: true, pfpUrl: true } },
          },
        }),
        prisma.$executeRaw`
          UPDATE service_offerings
          SET completed_jobs = completed_jobs + 1,
              avg_latency_ms = CASE
                WHEN completed_jobs = 0 THEN ${latencyMs}
                ELSE ((avg_latency_ms * completed_jobs) + ${latencyMs}) / (completed_jobs + 1)
              END,
              updated_at = NOW()
          WHERE id = ${job.offeringId}
        `,
      ]);

      // ── 2% Protocol Fee → $RUN Buyback & Burn ────────────────────────
      //
      // On every COMPLETED service job, 2% of the priceUsdc is allocated
      // to the protocol's Buyback & Burn mechanism. This fee is routed
      // through the FeeSplitter contract (40/40/20 split) on Base.
      //
      // Phase 1 (current): Calculate + log + queue as structured stub.
      // Phase 2 (when FeeSplitter is deployed): Execute via Uniswap V3.
      //
      const PROTOCOL_FEE_BPS = 200; // 2% = 200 basis points
      const buybackAmount = (job.priceUsdc * BigInt(PROTOCOL_FEE_BPS)) / 10_000n;

      await queueBuybackJob(jobId, buybackAmount);

      logger.info(
        {
          jobId,
          priceUsdc: job.priceUsdc.toString(),
          buybackAmount: buybackAmount.toString(),
          protocolFeeBps: PROTOCOL_FEE_BPS,
        },
        "Service job completed — 2% buyback fee queued",
      );

      return successResponse({
        ...updatedJob,
        priceUsdc: updatedJob.priceUsdc.toString(),
      });
    }

    // Non-COMPLETED transitions
    const updatedJob = await prisma.serviceJob.update({
      where: { id: jobId },
      data: updateData,
      include: {
        offering: { select: { slug: true, name: true, category: true } },
        buyerAgent: { select: { id: true, name: true, pfpUrl: true } },
      },
    });

    logger.info(
      { jobId, from: job.status, to: newStatus },
      "Service job status transitioned",
    );

    return successResponse({
      ...updatedJob,
      priceUsdc: updatedJob.priceUsdc.toString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
