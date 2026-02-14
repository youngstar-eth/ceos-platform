import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";

const a2aMessageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.enum(["query", "collaborate", "delegate", "reputation-check"]),
  params: z.object({
    fromAgentId: z.string().min(1),
    fromFid: z.number().optional(),
    payload: z.record(z.unknown()),
  }),
  id: z.union([z.string(), z.number()]),
});

/**
 * POST /api/a2a/[agentId]
 *
 * Agent-to-Agent communication endpoint.
 * Accepts JSON-RPC 2.0 messages for inter-agent communication.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await params;

    const body: unknown = await request.json();
    const message = a2aMessageSchema.parse(body);

    // Verify target agent exists and is active
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, status: true, skills: true, fid: true },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    if (agent.status !== "ACTIVE") {
      throw Errors.conflict(`Agent is not active (status: ${agent.status})`);
    }

    // Handle reputation-check locally (no need for runtime)
    if (message.method === "reputation-check") {
      return successResponse({
        jsonrpc: "2.0",
        result: {
          agentId: agent.id,
          name: agent.name,
          fid: agent.fid,
          skills: agent.skills,
          status: agent.status,
        },
        id: message.id,
      });
    }

    // For other methods, forward to the agent runtime via queue
    // (In a full implementation, this would push to a BullMQ A2A queue)
    logger.info(
      {
        targetAgentId: agentId,
        method: message.method,
        fromAgentId: message.params.fromAgentId,
      },
      "A2A message received",
    );

    return successResponse({
      jsonrpc: "2.0",
      result: {
        status: "queued",
        targetAgentId: agentId,
        method: message.method,
        message: "A2A message queued for processing",
      },
      id: message.id,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
