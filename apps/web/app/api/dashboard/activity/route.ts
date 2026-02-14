import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";

/**
 * GET /api/dashboard/activity
 *
 * Returns recent activity for the authenticated creator's agents.
 * Combines recent casts, agent status changes, and revenue events.
 */
export async function GET(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") ?? "10"),
      50,
    );

    // Find all agents owned by this creator
    const agents = await prisma.agent.findMany({
      where: { creatorAddress: address },
      select: { id: true, name: true, status: true, createdAt: true },
    });

    const agentIds = agents.map((a) => a.id);
    const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

    // Fetch recent casts and revenue claims in parallel
    const [recentCasts, recentClaims] = await Promise.all([
      agentIds.length > 0
        ? prisma.cast.findMany({
            where: { agentId: { in: agentIds } },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
              id: true,
              agentId: true,
              content: true,
              type: true,
              likes: true,
              recasts: true,
              replies: true,
              publishedAt: true,
              createdAt: true,
            },
          })
        : [],
      prisma.revenueClaim.findMany({
        where: { address },
        orderBy: { claimedAt: "desc" },
        take: limit,
        select: {
          id: true,
          epoch: true,
          amount: true,
          claimedAt: true,
        },
      }),
    ]);

    // Build unified activity list
    type Activity = {
      id: string;
      type: "cast" | "engagement" | "revenue" | "deploy";
      agent: string;
      action: string;
      timestamp: string;
    };

    const activities: Activity[] = [];

    // Cast activities
    for (const cast of recentCasts) {
      const agentName = agentNameMap.get(cast.agentId) ?? "Unknown Agent";
      const engagement = cast.likes + cast.recasts + cast.replies;

      if (engagement > 0) {
        activities.push({
          id: `engagement-${cast.id}`,
          type: "engagement",
          agent: agentName,
          action: `Received ${cast.likes} likes, ${cast.recasts} recasts on a cast`,
          timestamp: (cast.publishedAt ?? cast.createdAt).toISOString(),
        });
      }

      activities.push({
        id: `cast-${cast.id}`,
        type: "cast",
        agent: agentName,
        action: `Published a ${cast.type.toLowerCase()} cast`,
        timestamp: (cast.publishedAt ?? cast.createdAt).toISOString(),
      });
    }

    // Revenue activities
    for (const claim of recentClaims) {
      const ethAmount = Number(claim.amount) / 1e18;
      activities.push({
        id: `revenue-${claim.id}`,
        type: "revenue",
        agent: "System",
        action: `Epoch ${claim.epoch} rewards claimed: ${ethAmount.toFixed(4)} ETH`,
        timestamp: claim.claimedAt.toISOString(),
      });
    }

    // Deploy activities (agents created recently)
    for (const agent of agents) {
      if (agent.status !== "PENDING") {
        activities.push({
          id: `deploy-${agent.id}`,
          type: "deploy",
          agent: agent.name,
          action: "Agent deployed successfully on Base",
          timestamp: agent.createdAt.toISOString(),
        });
      }
    }

    // Sort by timestamp descending and take limit
    activities.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return successResponse(activities.slice(0, limit));
  } catch (err) {
    return errorResponse(err);
  }
}
