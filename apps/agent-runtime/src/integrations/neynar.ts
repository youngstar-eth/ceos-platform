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

interface SignerInfo {
  signer_uuid: string;
  public_key: string;
  status: 'generated' | 'pending_approval' | 'approved' | 'revoked';
  signer_approval_url?: string;
  fid?: number;
}

interface NeynarUser {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  custody_address: string;
}

export class NeynarClient {
  private readonly apiKey: string;
  private readonly logger: pino.Logger;
  private readonly mentionPollers: Map<number, NodeJS.Timeout> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.logger = rootLogger.child({ module: 'NeynarClient' });
  }

  /**
   * Create a new Neynar signer. Returns a signer_uuid in "generated" status.
   * The signer must then be registered via registerSignedKey or approved via Warpcast.
   */
  async createSigner(): Promise<SignerInfo> {
    this.logger.info('Creating new Neynar signer');

    const response = await this.fetchWithRetry<SignerInfo>(
      `${NEYNAR_API_BASE}/signer`,
      { method: 'POST', body: JSON.stringify({}) },
    );

    this.logger.info(
      { signerUuid: response.signer_uuid, status: response.status },
      'Signer created',
    );

    return response;
  }

  /**
   * Create a new Farcaster account with an approved signer.
   * Uses the Neynar managed account creation flow:
   * 1. Reserve an FID via App Wallet
   * 2. Generate EIP-712 signature with deployer key
   * 3. Register the account with username & metadata
   *
   * Requires NEYNAR_WALLET_ID and DEPLOYER_PRIVATE_KEY env vars.
   */
  async createFarcasterAccount(walletId: string, options: {
    username: string;
    displayName: string;
    bio?: string;
    pfpUrl?: string;
    deployerPrivateKey: string;
  }): Promise<{ fid: number; signerUuid: string; username: string; custodyAddress: string }> {
    const { privateKeyToAccount } = await import('viem/accounts');

    this.logger.info({ username: options.username }, 'Creating new Farcaster account');

    // Step 1: Reserve an FID
    this.logger.info('Step 1: Reserving FID...');
    const fidResponse = await this.fetchWithRetry<{ fid: number }>(
      `${NEYNAR_API_BASE}/user/fid`,
      {
        method: 'GET',
        headers: { 'x-wallet-id': walletId },
      },
    );

    this.logger.info({ fid: fidResponse.fid }, 'FID reserved');

    // Step 2: Generate EIP-712 signature
    this.logger.info('Step 2: Generating signature...');
    const account = privateKeyToAccount(options.deployerPrivateKey as `0x${string}`);
    const custodyAddress = account.address;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const ID_GATEWAY_ADDRESS = '0x00000000Fc25870C6eD6b6c7E41Fb078b7656f69' as const;

    const signature = await account.signTypedData({
      domain: {
        name: 'Farcaster IdGateway',
        version: '1',
        chainId: 10,
        verifyingContract: ID_GATEWAY_ADDRESS,
      },
      types: {
        Register: [
          { name: 'to', type: 'address' },
          { name: 'recovery', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Register',
      message: {
        to: custodyAddress,
        recovery: custodyAddress,
        nonce: BigInt(0),
        deadline,
      },
    });

    // Step 3: Register account with user details
    this.logger.info({ fid: fidResponse.fid }, 'Step 3: Registering account...');
    const registerBody: Record<string, unknown> = {
      signature,
      fid: fidResponse.fid,
      requested_user_custody_address: custodyAddress,
      deadline: Number(deadline),
      fname: options.username,
      metadata: {
        bio: options.bio ?? 'AI agent on Farcaster | Powered by ceos.run',
        pfp_url: options.pfpUrl ?? '',
        display_name: options.displayName,
        url: '',
      },
    };

    const registerResponse = await this.fetchWithRetry<{
      success: boolean;
      message: string;
      signer: {
        signer_uuid: string;
        public_key: string;
        status: string;
        fid: number;
      };
    }>(
      `${NEYNAR_API_BASE}/user`,
      {
        method: 'POST',
        headers: { 'x-wallet-id': walletId },
        body: JSON.stringify(registerBody),
      },
    );

    this.logger.info(
      {
        fid: fidResponse.fid,
        username: options.username,
        signerUuid: registerResponse.signer?.signer_uuid,
        signerStatus: registerResponse.signer?.status,
      },
      'Farcaster account created successfully',
    );

    return {
      fid: fidResponse.fid,
      signerUuid: registerResponse.signer?.signer_uuid ?? '',
      username: options.username,
      custodyAddress,
    };
  }

  /**
   * Look up a signer's current status.
   */
  async getSigner(signerUuid: string): Promise<SignerInfo> {
    const response = await this.fetchWithRetry<SignerInfo>(
      `${NEYNAR_API_BASE}/signer?signer_uuid=${signerUuid}`,
      { method: 'GET' },
    );

    return response;
  }

  /**
   * Look up a Farcaster user by FID.
   */
  async getUserByFid(fid: number): Promise<NeynarUser> {
    const response = await this.fetchWithRetry<{ users: NeynarUser[] }>(
      `${NEYNAR_API_BASE}/user/bulk?fids=${fid}`,
      { method: 'GET' },
    );

    const user = response.users[0];
    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }
    return user;
  }

  /**
   * Look up a Farcaster user by username.
   */
  async getUserByUsername(username: string): Promise<NeynarUser> {
    const response = await this.fetchWithRetry<{ result: { users: NeynarUser[] } }>(
      `${NEYNAR_API_BASE}/user/search?q=${encodeURIComponent(username)}&limit=1`,
      { method: 'GET' },
    );

    const user = response.result.users[0];
    if (!user) {
      throw new Error(`User "${username}" not found`);
    }
    return user;
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
    options?: {
      redis?: {
        sadd: (key: string, ...members: string[]) => Promise<number>;
        sismember: (key: string, member: string) => Promise<number>;
      };
    },
  ): void {
    if (this.mentionPollers.has(fid)) {
      this.logger.warn({ fid }, 'Mention polling already active');
      return;
    }

    const repliedSetKey = `replied-mentions:${fid}`;
    let lastPollTime = new Date();

    const poll = async () => {
      try {
        const mentions = await this.getMentions(fid, lastPollTime);
        lastPollTime = new Date();

        if (mentions.length === 0) return;

        let filtered = mentions;

        // Dedup: filter out already-replied mentions via Redis Set
        if (options?.redis) {
          const deduped: Mention[] = [];
          for (const m of filtered) {
            const alreadyReplied = await options.redis.sismember(repliedSetKey, m.castHash);
            if (!alreadyReplied) {
              deduped.push(m);
            }
          }
          filtered = deduped;
        }

        // Spam filter: skip mentions from very new accounts (FID < 1000)
        const MIN_AUTHOR_FID = 1000;
        filtered = filtered.filter((m) => m.authorFid >= MIN_AUTHOR_FID);

        if (filtered.length > 0) {
          this.logger.info(
            { fid, newMentions: filtered.length, rawTotal: mentions.length },
            'New mentions found (after dedup/spam filter)',
          );
          await callback(filtered);

          // Mark as replied in Redis for future dedup
          if (options?.redis) {
            for (const m of filtered) {
              await options.redis.sadd(repliedSetKey, m.castHash);
            }
          }
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

export type { Cast, CastOptions, Mention, SignerInfo, NeynarUser };
