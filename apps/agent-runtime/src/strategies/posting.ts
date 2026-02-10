import { ContentType } from '../core/content-pipeline.js';

interface ContentWeight {
  type: ContentType;
  weight: number;
}

export interface ContentStrategy {
  name: string;
  description: string;
  weights: ContentWeight[];
}

export const BALANCED_STRATEGY: ContentStrategy = {
  name: 'Balanced',
  description: 'Mix of original content, threads, engagement, and media posts',
  weights: [
    { type: ContentType.ORIGINAL, weight: 0.35 },
    { type: ContentType.THREAD, weight: 0.25 },
    { type: ContentType.ENGAGEMENT, weight: 0.20 },
    { type: ContentType.MEDIA, weight: 0.20 },
  ],
};

export const TEXT_HEAVY_STRATEGY: ContentStrategy = {
  name: 'TextHeavy',
  description: 'Prioritizes text content and threads over media',
  weights: [
    { type: ContentType.ORIGINAL, weight: 0.40 },
    { type: ContentType.THREAD, weight: 0.35 },
    { type: ContentType.ENGAGEMENT, weight: 0.15 },
    { type: ContentType.MEDIA, weight: 0.10 },
  ],
};

export const MEDIA_HEAVY_STRATEGY: ContentStrategy = {
  name: 'MediaHeavy',
  description: 'Prioritizes media-rich content with visual elements',
  weights: [
    { type: ContentType.ORIGINAL, weight: 0.15 },
    { type: ContentType.THREAD, weight: 0.15 },
    { type: ContentType.ENGAGEMENT, weight: 0.20 },
    { type: ContentType.MEDIA, weight: 0.50 },
  ],
};

export const STRATEGIES: Record<string, ContentStrategy> = {
  Balanced: BALANCED_STRATEGY,
  TextHeavy: TEXT_HEAVY_STRATEGY,
  MediaHeavy: MEDIA_HEAVY_STRATEGY,
};

export function getStrategy(name: string): ContentStrategy {
  const strategy = STRATEGIES[name];
  if (!strategy) {
    throw new Error(`Unknown strategy: "${name}". Available: ${Object.keys(STRATEGIES).join(', ')}`);
  }
  return strategy;
}

export function selectContentType(strategy: ContentStrategy): ContentType {
  const random = Math.random();
  let cumulative = 0;

  for (const entry of strategy.weights) {
    cumulative += entry.weight;
    if (random <= cumulative) {
      return entry.type;
    }
  }

  // Fallback to last weight entry (handles floating point edge cases)
  const lastEntry = strategy.weights[strategy.weights.length - 1];
  return lastEntry?.type ?? ContentType.ORIGINAL;
}

export function buildPrompt(agentPersona: string, contentType: ContentType): string {
  const basePersonaInstruction = `You are an AI agent posting on Farcaster (a decentralized social network). Your persona: ${agentPersona}

Stay in character at all times. Be authentic, engaging, and conversational. Do NOT use hashtags. Do NOT use emojis excessively. Write like a real person.`;

  switch (contentType) {
    case ContentType.ORIGINAL:
      return `${basePersonaInstruction}

Write a single, original Farcaster post (under 320 characters). It should be thought-provoking, insightful, or entertaining. Share an opinion, observation, or idea that fits your persona.

Output ONLY the post text, nothing else.`;

    case ContentType.THREAD:
      return `${basePersonaInstruction}

Write a multi-part thread for Farcaster. Each part must be under 320 characters. Write 3-5 parts that explore a topic in depth. The first part should hook the reader.

Separate each part with "---SPLIT---".

Output ONLY the thread parts separated by ---SPLIT---, nothing else.`;

    case ContentType.ENGAGEMENT:
      return `${basePersonaInstruction}

Write a Farcaster post (under 320 characters) designed to spark conversation and engagement. Ask a question, share a hot take, or start a debate. Make people want to reply.

Output ONLY the post text, nothing else.`;

    case ContentType.MEDIA:
      return `${basePersonaInstruction}

Write a short Farcaster post (under 250 characters) that will accompany an image. The text should complement a visual element. Be descriptive but brief.

Output ONLY the post text, nothing else.`;

    default:
      return `${basePersonaInstruction}

Write a single Farcaster post (under 320 characters). Be engaging and authentic.

Output ONLY the post text, nothing else.`;
  }
}
