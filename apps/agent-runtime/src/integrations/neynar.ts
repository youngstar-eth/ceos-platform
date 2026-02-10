import pino from 'pino';
import { logger as rootLogger } from '../config.js';

const NEYNAR_API_BASE = 'https://api.neynar.com/v2/farcaster';
const CAST_MAX_LENGTH = 320;
const MENTION_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface CastOptions {
  embeds?: Array<{ url: string }>;
  replyTo?: string;
  channelId?: string;
}

interface Cast {
  hash: string;
  authorFid: number;
  text: string;
  timestamp: string;
  embeds: Array<{ url: string }>;
  parentHash?: string;
}

interface Mention {
  castHash: string;
  authorFid: number;
  authorUsername: string;
  text: string;
  timestamp: string;
  parentHash?: string;
}

interface NeynarCastResponse {
  cast: {
    hash: string;
    author: { fid: number };
    text: string;
    timestamp: string;
    embeds: Array<{ url: string }>;
    parent_hash?: string;
  };
}

interface NeynarNotificationsResponse {
  notifications: Array<{
    type: string;
    cast: {
      hash: string;
      author: { fid: number; username: string };
      text: string;
      timestamp: string;
      parent_hash?: string;
    };
  }>;
  cursor?: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class NeynarClient {
  private readonly apiKey: string;
  private readonly logger: pino.Logger;
  private readonly mentionPollers: Map<number, NodeJS.Timeout> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.logger = rootLogger.child({ module: 'NeynarClient' });
  }

  async publishCast(
    signerUuid: string,
    text: string,
    options?: CastOptions,
  ): Promise<Cast> {
    const trimmedText = text.length > CAST_MAX_LENGTH
      ? text.slice(0, CAST_MAX_LENGTH - 3) + '...'
      : text;

    this.logger.info(
      { signerUuid: signerUuid.slice(0, 8) + '...', textLength: trimmedText.length },
      'Publishing cast',
    );

    const body: Record<string, unknown> = {
      signer_uuid: signerUuid,
      text: trimmedText,
    };

    if (options?.embeds && options.embeds.length > 0) {
      body['embeds'] = options.embeds;
    }

    if (options?.replyTo) {
      body['parent'] = options.replyTo;
    }

    if (options?.channelId) {
      body['channel_id'] = options.channelId;
    }

    const response = await this.fetchWithRetry<NeynarCastResponse>(
      `${NEYNAR_API_BASE}/cast`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );

    const cast: Cast = {
      hash: response.cast.hash,
      authorFid: response.cast.author.fid,
      text: response.cast.text,
      timestamp: response.cast.timestamp,
      embeds: response.cast.embeds,
      parentHash: response.cast.parent_hash,
    };

    this.logger.info({ castHash: cast.hash }, 'Cast published successfully');
    return cast;
  }

  async publishThread(
    signerUuid: string,
    parts: string[],
    options?: Omit<CastOptions, 'replyTo'>,
  ): Promise<Cast[]> {
    if (parts.length === 0) {
      throw new Error('Thread must have at least one part');
    }

    this.logger.info(
      { signerUuid: signerUuid.slice(0, 8) + '...', partCount: parts.length },
      'Publishing thread',
    );

    const casts: Cast[] = [];
    let parentHash: string | undefined;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const castOptions: CastOptions = {
        ...options,
        replyTo: parentHash,
      };

      // Add embeds only to the first cast if provided
      if (i > 0) {
        castOptions.embeds = undefined;
      }

      const cast = await this.publishCast(signerUuid, part, castOptions);
      casts.push(cast);
      parentHash = cast.hash;

      // Small delay between thread parts to avoid rate limits
      if (i < parts.length - 1) {
        await this.sleep(1500);
      }
    }

    this.logger.info(
      { threadLength: casts.length, firstCastHash: casts[0]?.hash },
      'Thread published successfully',
    );

    return casts;
  }

  async getMentions(fid: number, since?: Date): Promise<Mention[]> {
    this.logger.debug({ fid }, 'Fetching mentions');

    const params = new URLSearchParams({
      fid: fid.toString(),
      type: 'mentions',
    });

    const response = await this.fetchWithRetry<NeynarNotificationsResponse>(
      `${NEYNAR_API_BASE}/notifications?${params.toString()}`,
      { method: 'GET' },
    );

    let mentions = response.notifications
      .filter((n) => n.type === 'mention' || n.type === 'reply')
      .map((n): Mention => ({
        castHash: n.cast.hash,
        authorFid: n.cast.author.fid,
        authorUsername: n.cast.author.username,
        text: n.cast.text,
        timestamp: n.cast.timestamp,
        parentHash: n.cast.parent_hash,
      }));

    if (since) {
      const sinceTime = since.getTime();
      mentions = mentions.filter((m) => new Date(m.timestamp).getTime() > sinceTime);
    }

    this.logger.debug({ fid, mentionCount: mentions.length }, 'Mentions fetched');
    return mentions;
  }

  async replyCast(
    signerUuid: string,
    parentHash: string,
    text: string,
  ): Promise<Cast> {
    return this.publishCast(signerUuid, text, { replyTo: parentHash });
  }

  startMentionPolling(
    fid: number,
    callback: (mentions: Mention[]) => void | Promise<void>,
  ): void {
    if (this.mentionPollers.has(fid)) {
      this.logger.warn({ fid }, 'Mention polling already active');
      return;
    }

    let lastPollTime = new Date();

    const poll = async () => {
      try {
        const mentions = await this.getMentions(fid, lastPollTime);
        lastPollTime = new Date();

        if (mentions.length > 0) {
          this.logger.info({ fid, newMentions: mentions.length }, 'New mentions found');
          await callback(mentions);
        }
      } catch (error) {
        this.logger.error(
          { fid, error: error instanceof Error ? error.message : String(error) },
          'Mention polling error',
        );
      }
    };

    const timer = setInterval(() => void poll(), MENTION_POLL_INTERVAL_MS);
    this.mentionPollers.set(fid, timer);

    // Run immediately
    void poll();

    this.logger.info({ fid, intervalMs: MENTION_POLL_INTERVAL_MS }, 'Mention polling started');
  }

  stopMentionPolling(fid: number): void {
    const timer = this.mentionPollers.get(fid);
    if (timer) {
      clearInterval(timer);
      this.mentionPollers.delete(fid);
      this.logger.info({ fid }, 'Mention polling stopped');
    }
  }

  stopAllPolling(): void {
    for (const [fid, timer] of this.mentionPollers.entries()) {
      clearInterval(timer);
      this.logger.debug({ fid }, 'Polling stopped');
    }
    this.mentionPollers.clear();
    this.logger.info('All mention polling stopped');
  }

  private async fetchWithRetry<T>(url: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
            api_key: this.apiKey,
            ...init.headers,
          },
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
          this.logger.warn({ attempt: attempt + 1, delay }, 'Rate limited by Neynar');
          await this.sleep(delay);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Neynar API error (${response.status}): ${errorText}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }

        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(
          { attempt: attempt + 1, delay, error: error instanceof Error ? error.message : String(error) },
          'Retrying Neynar request',
        );
        await this.sleep(delay);
      }
    }

    throw new Error(`Neynar request failed after ${MAX_RETRIES} retries`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export type { Cast, CastOptions, Mention };
