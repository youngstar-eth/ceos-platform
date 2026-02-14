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
const NEYNAR_API_BASE = 'https://api.neynar.com/v2/farcaster';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY ?? '';

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
    const trends: Trend[] = [];

    // Step 1: Fetch real trending data from Neynar
    if (NEYNAR_API_KEY) {
      try {
        // Fetch trending casts
        const feedRes = await fetch(`${NEYNAR_API_BASE}/feed/trending?limit=25`, {
          headers: { accept: 'application/json', api_key: NEYNAR_API_KEY },
        });

        if (feedRes.ok) {
          const feedData = (await feedRes.json()) as {
            casts: Array<{
              hash: string;
              text: string;
              reactions: { likes_count: number; recasts_count: number };
            }>;
          };

          // Extract topic signals from high-engagement casts
          const castTexts = feedData.casts
            .map((c) => c.text.slice(0, 200))
            .join('\n---\n');

          if (castTexts.length > 0) {
            // Use AI to cluster trending cast themes into distinct topics
            const result = await this.openrouter.generateText(
              `Analyze these trending Farcaster casts and extract ${MAX_TRENDS} distinct trending topics. For each topic, provide a brief one-sentence description.\n\nCasts:\n${castTexts}\n\nFormat as JSON array with objects containing "topic" and "description" fields. Output ONLY the JSON array, nothing else.`,
              { maxTokens: 500, temperature: 0.3 },
            );

            const parsed: unknown = JSON.parse(result.text);
            if (Array.isArray(parsed)) {
              for (let i = 0; i < Math.min(parsed.length, MAX_TRENDS); i++) {
                const item = parsed[i] as { topic?: string; description?: string };
                if (item?.topic) {
                  trends.push({
                    id: `trend-${Date.now()}-${i}`,
                    topic: String(item.topic),
                    description: String(item.description ?? ''),
                    score: MAX_TRENDS - i,
                    detectedAt: new Date(),
                    source: 'farcaster',
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to fetch Neynar trending feed',
        );
      }

      try {
        // Fetch trending channels
        const channelRes = await fetch(`${NEYNAR_API_BASE}/channel/trending?time_window=24h&limit=5`, {
          headers: { accept: 'application/json', api_key: NEYNAR_API_KEY },
        });

        if (channelRes.ok) {
          const channelData = (await channelRes.json()) as {
            channels: Array<{
              id: string;
              name: string;
              description: string;
              follower_count: number;
            }>;
          };

          for (const ch of channelData.channels) {
            trends.push({
              id: `channel-${ch.id}`,
              topic: ch.name,
              description: ch.description?.slice(0, 200) ?? `Trending channel: /${ch.id}`,
              score: Math.min(ch.follower_count / 100, MAX_TRENDS),
              detectedAt: new Date(),
              source: 'farcaster',
            });
          }
        }
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to fetch trending channels',
        );
      }
    }

    // Fallback: if no Neynar data, use AI-generated topics
    if (trends.length === 0) {
      try {
        const result = await this.openrouter.generateText(
          `List ${MAX_TRENDS} current trending topics in the crypto/web3/AI community. For each, provide a brief one-sentence description. Format as JSON array with objects containing "topic" and "description" fields. Output ONLY the JSON array, nothing else.`,
          { maxTokens: 500, temperature: 0.5 },
        );

        const parsed: unknown = JSON.parse(result.text);
        if (Array.isArray(parsed)) {
          for (let i = 0; i < Math.min(parsed.length, MAX_TRENDS); i++) {
            const item = parsed[i] as { topic?: string; description?: string };
            if (item?.topic) {
              trends.push({
                id: `ai-trend-${Date.now()}-${i}`,
                topic: String(item.topic),
                description: String(item.description ?? ''),
                score: MAX_TRENDS - i,
                detectedAt: new Date(),
                source: 'external',
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to fetch trending topics from AI',
        );
      }
    }

    // Sort by score descending and limit
    trends.sort((a, b) => b.score - a.score);
    return trends.slice(0, MAX_TRENDS);
  }
}

export type { Trend, TrendContent, AgentTrendContext };
