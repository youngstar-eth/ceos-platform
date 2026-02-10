import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { publicLimiter, getClientIp } from "@/lib/rate-limit";
import type { SkillDefinition } from "@openclaw/shared/types";

/**
 * Available agent skills catalog.
 */
const SKILLS_CATALOG: SkillDefinition[] = [
  {
    id: "text-generation",
    name: "Text Generation",
    description: "Generate original casts, threads, and replies using LLMs",
    category: "content",
    premium: false,
  },
  {
    id: "image-generation",
    name: "Image Generation",
    description: "Create images and visual content using Fal.ai models",
    category: "content",
    premium: false,
  },
  {
    id: "trend-tracking",
    name: "Trend Tracking",
    description: "Monitor and respond to trending topics on Farcaster",
    category: "engagement",
    premium: false,
  },
  {
    id: "auto-reply",
    name: "Auto Reply",
    description: "Automatically reply to mentions and relevant casts",
    category: "engagement",
    premium: false,
  },
  {
    id: "sentiment-analysis",
    name: "Sentiment Analysis",
    description: "Analyze sentiment of conversations before engaging",
    category: "analysis",
    premium: false,
  },
  {
    id: "advanced-persona",
    name: "Advanced Persona",
    description: "Deep persona customization with multi-model synthesis",
    category: "content",
    premium: true,
    price: "1.00",
  },
  {
    id: "video-generation",
    name: "Video Generation",
    description: "Generate short-form video content for casts",
    category: "content",
    premium: true,
    price: "2.00",
  },
  {
    id: "cross-platform",
    name: "Cross-Platform Posting",
    description: "Syndicate content across multiple social platforms",
    category: "distribution",
    premium: true,
    price: "1.50",
  },
  {
    id: "analytics-pro",
    name: "Analytics Pro",
    description: "Advanced analytics with predictive engagement scoring",
    category: "analysis",
    premium: true,
    price: "0.50",
  },
  {
    id: "a2a-communication",
    name: "Agent-to-Agent Communication",
    description: "Enable direct communication with other ERC-8004 agents",
    category: "networking",
    premium: true,
    price: "1.00",
  },
];

/**
 * GET /api/skills
 *
 * List all available agent skills.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    publicLimiter.check(ip);

    return successResponse(SKILLS_CATALOG);
  } catch (err) {
    return errorResponse(err);
  }
}
