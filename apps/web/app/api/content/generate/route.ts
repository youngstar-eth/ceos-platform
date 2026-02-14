import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Errors } from "@/lib/errors";
import { verifyWalletSignature } from "@/lib/auth";
import { authenticatedLimiter } from "@/lib/rate-limit";
import { generateContentSchema } from "@/lib/validation";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// OpenRouter client (lightweight, scoped to this route)
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

function getOpenRouterClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
      "HTTP-Referer": "https://openclaw.xyz",
      "X-Title": "OpenClaw Content Generator",
    },
  });
}

// ---------------------------------------------------------------------------
// Content generation prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  agentName: string,
  persona: Record<string, unknown>,
  contentType: string,
  topic?: string | null,
  replyTo?: string | null,
): string {
  const tone = (persona.tone as string) ?? "informative";
  const style = (persona.style as string) ?? "conversational";
  const topics = (persona.topics as string[]) ?? [];
  const customPrompt = (persona.customPrompt as string) ?? "";

  const topicHint = topic
    ? `Focus on: ${topic}`
    : topics.length > 0
      ? `Topics of interest: ${topics.join(", ")}`
      : "";

  if (contentType === "REPLY" && replyTo) {
    return `You are ${agentName}, an AI agent on Farcaster. Tone: ${tone}. Style: ${style}.
${customPrompt}

Reply to this cast concisely (max 320 chars):
"${replyTo}"

${topicHint}`;
  }

  if (contentType === "THREAD") {
    return `You are ${agentName}, an AI agent on Farcaster. Tone: ${tone}. Style: ${style}.
${customPrompt}

Write a 3-part thread on Farcaster. Each part max 320 chars. Separate parts with "---".
${topicHint}`;
  }

  return `You are ${agentName}, an AI agent on Farcaster. Tone: ${tone}. Style: ${style}.
${customPrompt}

Write a single engaging Farcaster cast (max 320 chars). Be original and thought-provoking.
${topicHint}`;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/content/generate
 *
 * Generate content for an agent using OpenRouter AI.
 *
 * Returns generated text synchronously for preview/review.
 */
export async function POST(request: NextRequest) {
  try {
    const address = await verifyWalletSignature(request);
    authenticatedLimiter.check(address);

    const body: unknown = await request.json();
    const data = generateContentSchema.parse(body);

    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
    });

    if (!agent) {
      throw Errors.notFound("Agent");
    }

    if (agent.creatorAddress !== address) {
      throw Errors.forbidden("Only the creator can generate content for this agent");
    }

    if (agent.status !== "ACTIVE" && agent.status !== "PAUSED") {
      throw Errors.conflict(
        `Cannot generate content for an agent with status "${agent.status}"`,
      );
    }

    const persona = agent.persona as Record<string, unknown>;

    // Build prompt and call OpenRouter
    const prompt = buildPrompt(
      agent.name,
      persona,
      data.type,
      data.topic ?? null,
      data.replyTo ?? null,
    );

    if (!OPENROUTER_API_KEY) {
      logger.warn("OPENROUTER_API_KEY not set, returning generation context only");
      return successResponse({
        agentId: agent.id,
        type: data.type,
        generationContext: { prompt },
        message: "OpenRouter API key not configured. Set OPENROUTER_API_KEY to enable AI generation.",
      });
    }

    const client = getOpenRouterClient();

    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content: `You are ${agent.name}. Write content as this agent for Farcaster (similar to Twitter). Keep it within 320 characters per cast.`,
        },
        { role: "user", content: prompt },
      ],
      max_tokens: data.type === "THREAD" ? 800 : 200,
      temperature: 0.8,
    });

    const generatedText = completion.choices[0]?.message?.content ?? "";
    const model = completion.model ?? DEFAULT_MODEL;
    const tokensUsed = completion.usage?.total_tokens ?? 0;

    logger.info(
      { agentId: agent.id, type: data.type, model, tokensUsed },
      "Content generated via OpenRouter",
    );

    return successResponse({
      agentId: agent.id,
      type: data.type,
      content: generatedText,
      model,
      tokensUsed,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
