/**
 * Social Hunter — LLM Triage Module (The Brain)
 *
 * Evaluates Farcaster casts for sales opportunity using structured
 * LLM output (Zod-validated JSON). The triage produces a score (1-10),
 * reasoning, and a ready-to-send pitch reply when the score meets
 * the threshold.
 *
 * Uses OpenRouterClient.generateJSON<T>(prompt, schema, options) to
 * guarantee type-safe, schema-validated responses.
 */

import { z } from 'zod';
import type { OpenRouterClient } from '../integrations/openrouter.js';
import {
  TRIAGE_MODEL,
  TRIAGE_MAX_TOKENS,
  TRIAGE_THRESHOLD,
  MAX_PITCH_LENGTH,
} from '../config/social-hunter.js';

// ── Zod Schema ───────────────────────────────────────────────────────────

export const triageResultSchema = z.object({
  score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      'Sales opportunity score: 1=irrelevant, 5=maybe, 7=good lead, 10=perfect match',
    ),
  reason: z
    .string()
    .max(200)
    .describe("One-sentence explanation of why this is/isn't a good lead"),
  pitch: z
    .string()
    .max(MAX_PITCH_LENGTH)
    .describe(
      'A natural, helpful reply to the cast that subtly pitches our service. ' +
        'Do NOT be salesy. Be genuinely helpful first. Include the hire link naturally.',
    ),
  matchedOffering: z
    .string()
    .nullable()
    .describe(
      'The offering slug that best matches this need, or null if no match',
    ),
});

export type TriageResult = z.infer<typeof triageResultSchema>;

// ── Triage Input ─────────────────────────────────────────────────────────

export interface TriageInput {
  /** The text content of the Farcaster cast to evaluate */
  castText: string;
  /** The username of the cast's author */
  castAuthor: string;
  /** The channel where the cast was found (e.g. "ai", "trading") */
  castChannel: string | null;
  /** The agent's display name */
  agentName: string;
  /** The agent's persona prompt / bio */
  agentPersona: string;
  /** Available service offerings the agent can pitch */
  offerings: Array<{
    slug: string;
    name: string;
    category: string;
    description: string;
    /** USDC amount as string (micro-USDC, 6 decimals) */
    priceUsdc: string;
  }>;
  /** Base URL for hire links (e.g. "https://ceos.run/hire") */
  hireBaseUrl: string;
}

// ── System Prompt Builder ────────────────────────────────────────────────

/**
 * Build the system prompt that establishes the agent's identity,
 * scoring rubric, and pitch-writing rules.
 */
function buildSystemPrompt(input: TriageInput): string {
  const offeringsContext = input.offerings
    .map(
      (o) =>
        `- ${o.name} (${o.category}): ${o.description} [${o.slug}] — $${(Number(o.priceUsdc) / 1_000_000).toFixed(2)} USDC`,
    )
    .join('\n');

  return `You are ${input.agentName}, an autonomous AI agent on ceos.run.
Your persona: ${input.agentPersona}

You are scanning Farcaster for potential customers who could benefit from your services.

YOUR SERVICES:
${offeringsContext}

HIRE LINK FORMAT: ${input.hireBaseUrl}/{slug}

RULES FOR SCORING:
- Score 1-3: Cast is completely unrelated to your services
- Score 4-6: Cast is tangentially related but not a clear buying signal
- Score 7-8: Cast expresses a clear need that matches one of your services
- Score 9-10: Cast is an explicit request for exactly what you offer

RULES FOR THE PITCH:
- Be genuinely helpful. Answer their question or add value FIRST.
- Mention your service naturally, as if a friend is recommending something.
- Include exactly ONE hire link: ${input.hireBaseUrl}/{matchedSlug}
- Keep it under ${MAX_PITCH_LENGTH} characters.
- Do NOT use hashtags, emojis spam, or "DM me" language.
- Do NOT be salesy. Think "helpful community member", not "cold outreach."
- Match the tone of the Farcaster community (casual, authentic, builder-friendly).

If score < ${TRIAGE_THRESHOLD}, the pitch field can be a placeholder — it won't be sent.`;
}

// ── User Prompt Builder ──────────────────────────────────────────────────

/**
 * Build the user prompt containing the cast to evaluate.
 */
function buildUserPrompt(input: TriageInput): string {
  return `CAST TO EVALUATE:
Author: @${input.castAuthor}
${input.castChannel ? `Channel: /${input.castChannel}` : 'Channel: (none)'}
Text: "${input.castText}"

Evaluate this cast and respond with your triage assessment as JSON.`;
}

// ── Main Triage Function ─────────────────────────────────────────────────

/**
 * Evaluate a Farcaster cast for sales opportunity using LLM.
 *
 * Returns a structured triage result with score, reasoning, and
 * a ready-to-send pitch reply if the score meets the threshold.
 *
 * @param llm - OpenRouter client instance
 * @param input - Cast + agent context for triage
 * @returns Zod-validated TriageResult
 */
export async function triageCast(
  llm: OpenRouterClient,
  input: TriageInput,
): Promise<TriageResult> {
  const systemPrompt = buildSystemPrompt(input);
  const userPrompt = buildUserPrompt(input);

  // OpenRouterClient.generateJSON<T>(prompt, schema, options?)
  // The prompt arg becomes the user message;
  // systemPrompt is passed in options and becomes the system message.
  return llm.generateJSON<TriageResult>(userPrompt, triageResultSchema, {
    model: TRIAGE_MODEL,
    maxTokens: TRIAGE_MAX_TOKENS,
    systemPrompt,
  });
}
