import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import { OpenRouterClient } from '../integrations/openrouter.js';
import type { Mention, Cast } from '../integrations/neynar.js';

interface AgentContext {
  agentId: string;
  name: string;
  persona: string;
  signerUuid: string;
  fid: number;
}

interface ReplyResult {
  text: string;
  model: string;
  tokensUsed: number;
}

const ENGAGEMENT_THRESHOLD = 5; // Minimum likes/recasts to consider for recast
const REPLY_MAX_LENGTH = 280;

export class EngagementStrategy {
  private readonly openrouter: OpenRouterClient;
  private readonly logger: pino.Logger;

  constructor(openrouter: OpenRouterClient) {
    this.openrouter = openrouter;
    this.logger = rootLogger.child({ module: 'EngagementStrategy' });
  }

  async handleMention(agent: AgentContext, mention: Mention): Promise<ReplyResult> {
    this.logger.info(
      {
        agentId: agent.agentId,
        mentionAuthor: mention.authorUsername,
        castHash: mention.castHash,
      },
      'Handling mention',
    );

    const prompt = `You are "${agent.name}", an AI agent on Farcaster. Your persona: ${agent.persona}

Someone mentioned you in a post. Here is what they said:
"${mention.text}"

Their username is @${mention.authorUsername}.

Write a natural, contextual reply (under ${REPLY_MAX_LENGTH} characters). Be helpful, friendly, and stay in character. If they asked a question, answer it. If they made a comment, engage thoughtfully.

Do NOT:
- Use hashtags
- Be overly formal
- Start with "Hey!" or "Hi there!"
- Mention that you are an AI

Output ONLY your reply text, nothing else.`;

    const result = await this.openrouter.generateText(prompt, {
      maxTokens: 150,
      temperature: 0.8,
    });

    let replyText = result.text.trim();

    // Remove wrapping quotes if present
    if (
      (replyText.startsWith('"') && replyText.endsWith('"')) ||
      (replyText.startsWith("'") && replyText.endsWith("'"))
    ) {
      replyText = replyText.slice(1, -1).trim();
    }

    // Truncate if needed
    if (replyText.length > REPLY_MAX_LENGTH) {
      replyText = replyText.slice(0, REPLY_MAX_LENGTH - 3) + '...';
    }

    this.logger.info(
      { agentId: agent.agentId, replyLength: replyText.length },
      'Reply generated for mention',
    );

    return {
      text: replyText,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  shouldRecast(agent: AgentContext, cast: CastWithMetrics): boolean {
    // Don't recast own content
    if (cast.authorFid === agent.fid) {
      return false;
    }

    const totalEngagement = (cast.likes ?? 0) + (cast.recasts ?? 0);

    if (totalEngagement < ENGAGEMENT_THRESHOLD) {
      return false;
    }

    // Check relevance by persona keywords (simple heuristic)
    const personaKeywords = agent.persona.toLowerCase().split(/\s+/);
    const castText = cast.text.toLowerCase();
    const relevanceScore = personaKeywords.filter((keyword) =>
      keyword.length > 3 && castText.includes(keyword),
    ).length;

    const isRelevant = relevanceScore >= 2;

    this.logger.debug(
      {
        agentId: agent.agentId,
        castHash: cast.hash,
        totalEngagement,
        relevanceScore,
        isRelevant,
      },
      'Recast evaluation',
    );

    return isRelevant;
  }

  async generateReply(
    agent: AgentContext,
    context: ConversationContext,
  ): Promise<ReplyResult> {
    this.logger.info(
      { agentId: agent.agentId, contextType: context.type },
      'Generating contextual reply',
    );

    const conversationHistory = context.previousCasts
      .map((c) => `@${c.authorUsername}: "${c.text}"`)
      .join('\n');

    const prompt = `You are "${agent.name}", an AI agent on Farcaster. Your persona: ${agent.persona}

You are participating in a conversation. Here is the conversation so far:
${conversationHistory}

${context.type === 'question' ? 'The last message asks a question. Answer it thoughtfully.' : ''}
${context.type === 'debate' ? 'Share your perspective on the ongoing discussion.' : ''}
${context.type === 'casual' ? 'Continue the conversation naturally.' : ''}

Write a reply (under ${REPLY_MAX_LENGTH} characters). Stay in character. Be genuine.

Output ONLY your reply text, nothing else.`;

    const result = await this.openrouter.generateText(prompt, {
      maxTokens: 150,
      temperature: 0.85,
    });

    let replyText = result.text.trim();

    if (replyText.length > REPLY_MAX_LENGTH) {
      replyText = replyText.slice(0, REPLY_MAX_LENGTH - 3) + '...';
    }

    return {
      text: replyText,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }
}

interface CastWithMetrics extends Cast {
  likes?: number;
  recasts?: number;
}

interface ConversationCast {
  authorUsername: string;
  text: string;
}

interface ConversationContext {
  type: 'question' | 'debate' | 'casual';
  previousCasts: ConversationCast[];
}

export type { AgentContext, ReplyResult, CastWithMetrics, ConversationContext };
