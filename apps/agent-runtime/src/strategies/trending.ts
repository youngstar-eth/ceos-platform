import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import { OpenRouterClient } from '../integrations/openrouter.js';
import type { ContentType } from '../core/types.js';

interface Trend {
  id: string;
  topic: string;
  description: string;
  score: number;
  detectedAt: Date;
  source: 'farcaster' | 'external';
}

interface TrendContent {
  text: string;
  type: ContentType;
  trend: Trend;
  model: string;
  tokensUsed: number;
}

interface AgentTrendContext {
  agentId: string;
  name: string;
  persona: string;
}

const CHECK_FREQUENCY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_TRENDS = 10;
const TREND_CONTENT_MAX_LENGTH = 320;

export class TrendingStrategy {
  private readonly openrouter: OpenRouterClient;
  private readonly logger: pino.Logger;
  private cachedTrends: Trend[] = [];
  private lastFetchTime: Date | null = null;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(openrouter: OpenRouterClient) {
    this.openrouter = openrouter;
    this.logger = rootLogger.child({ module: 'TrendingStrategy' });
  }

  async detectTrends(): Promise<Trend[]> {
    this.logger.info('Detecting trends');

    // Check cache freshness
    if (
      this.lastFetchTime &&
      Date.now() - this.lastFetchTime.getTime() < CHECK_FREQUENCY_MS &&
      this.cachedTrends.length > 0
    ) {
      this.logger.debug({ cachedCount: this.cachedTrends.length }, 'Returning cached trends');
      return this.cachedTrends;
    }

    try {
      // Placeholder: In production, this would call Neynar trending API
      // or aggregate signals from multiple sources
      const trends = await this.fetchTrendingTopics();
      this.cachedTrends = trends;
      this.lastFetchTime = new Date();

      this.logger.info({ trendCount: trends.length }, 'Trends detected');
      return trends;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to detect trends',
      );
      return this.cachedTrends; // Return stale cache on error
    }
  }

  async generateTrendContent(
    agent: AgentTrendContext,
    trend: Trend,
  ): Promise<TrendContent> {
    this.logger.info(
      { agentId: agent.agentId, trendTopic: trend.topic },
      'Generating trend-based content',
    );

    const prompt = `You are "${agent.name}", an AI agent on Farcaster. Your persona: ${agent.persona}

A trending topic on Farcaster right now is: "${trend.topic}"
Description: ${trend.description}

Write a Farcaster post (under ${TREND_CONTENT_MAX_LENGTH} characters) that engages with this trend from YOUR unique perspective. Don't just restate the trend — add your take on it.

Do NOT:
- Use hashtags
- Be generic or boring
- Simply describe the trend
- Start with "Just saw..." or "Everyone is talking about..."

Output ONLY your post text, nothing else.`;

    const result = await this.openrouter.generateText(prompt, {
      maxTokens: 200,
      temperature: 0.85,
    });

    let text = result.text.trim();

    // Remove wrapping quotes
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1).trim();
    }

    if (text.length > TREND_CONTENT_MAX_LENGTH) {
      text = text.slice(0, TREND_CONTENT_MAX_LENGTH - 3) + '...';
    }

    return {
      text,
      type: 'original' as ContentType,
      trend,
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  startPeriodicCheck(
    callback: (trends: Trend[]) => void | Promise<void>,
  ): void {
    if (this.checkTimer) {
      this.logger.warn('Periodic trend check already running');
      return;
    }

    this.logger.info({ intervalMs: CHECK_FREQUENCY_MS }, 'Starting periodic trend checks');

    const check = async () => {
      try {
        const trends = await this.detectTrends();
        if (trends.length > 0) {
          await callback(trends);
        }
      } catch (error) {
        this.logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Periodic trend check failed',
        );
      }
    };

    this.checkTimer = setInterval(() => void check(), CHECK_FREQUENCY_MS);

    // Run immediately
    void check();
  }

  stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.logger.info('Periodic trend checks stopped');
    }
  }

  private async fetchTrendingTopics(): Promise<Trend[]> {
    // Placeholder implementation
    // In production, this would:
    // 1. Call Neynar trending channels/casts API
    // 2. Aggregate signals from high-engagement casts
    // 3. Use AI to cluster topics

    // For now, use OpenRouter to simulate trend detection based on current events
    try {
      const result = await this.openrouter.generateText(
        `List ${MAX_TRENDS} current trending topics in the crypto/web3/AI community. For each, provide a brief one-sentence description. Format as JSON array with objects containing "topic" and "description" fields. Output ONLY the JSON array, nothing else.`,
        { maxTokens: 500, temperature: 0.5 },
      );

      const parsed: unknown = JSON.parse(result.text);

      if (!Array.isArray(parsed)) {
        throw new Error('Expected JSON array');
      }

      return (parsed as Array<{ topic: string; description: string }>)
        .slice(0, MAX_TRENDS)
        .map((item, index) => ({
          id: `trend-${Date.now()}-${index}`,
          topic: String(item.topic ?? ''),
          description: String(item.description ?? ''),
          score: MAX_TRENDS - index,
          detectedAt: new Date(),
          source: 'farcaster' as const,
        }))
        .filter((t) => t.topic.length > 0);
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch trending topics from AI, returning empty',
      );
      return [];
    }
  }
}

export type { Trend, TrendContent, AgentTrendContext };
