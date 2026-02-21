/**
 * Tool Implementations — The actual API call functions behind each registered tool.
 *
 * Each function receives validated params from the LLM's tool_call and returns
 * structured data that gets fed back into the conversation as a tool result.
 *
 * Adding a new tool to the platform:
 *   1. Write the execute() function here
 *   2. Register a ToolDefinition in registerDefaultTools() below
 *   3. That's it — the ReAct loop picks it up automatically
 */

import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import {
  ToolRegistry,
  ToolTier,
  ToolCategory,
  type ToolDefinition,
} from './tool-registry.js';

const logger: pino.Logger = rootLogger.child({ module: 'ToolImplementations' });

// ── CoinGecko (Market Data) ──────────────────────────────────

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

async function getTokenPrice(params: Record<string, unknown>): Promise<unknown> {
  const symbol = String(params['symbol'] ?? 'bitcoin').toLowerCase();

  // Map common symbols to CoinGecko IDs
  const symbolMap: Record<string, string> = {
    btc: 'bitcoin',
    eth: 'ethereum',
    usdc: 'usd-coin',
    sol: 'solana',
    matic: 'matic-network',
    avax: 'avalanche-2',
    degen: 'degen-base',
    base: 'base-protocol',
  };

  const coinId = symbolMap[symbol] ?? symbol;

  try {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
    );

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, Record<string, number>>;
    const priceData = data[coinId];

    if (!priceData) {
      return { error: `Token "${symbol}" not found on CoinGecko`, symbol };
    }

    return {
      symbol,
      coinId,
      priceUsd: priceData['usd'],
      change24h: priceData['usd_24h_change'],
      marketCapUsd: priceData['usd_market_cap'],
    };
  } catch (error) {
    logger.error({ symbol, error: error instanceof Error ? error.message : String(error) }, 'CoinGecko price fetch failed');
    return { error: `Failed to fetch price for ${symbol}`, symbol };
  }
}

async function getTrendingTokens(_params: Record<string, unknown>): Promise<unknown> {
  try {
    const res = await fetch(`${COINGECKO_BASE}/search/trending`);

    if (!res.ok) {
      throw new Error(`CoinGecko trending API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      coins: Array<{
        item: {
          id: string;
          name: string;
          symbol: string;
          market_cap_rank: number;
          price_btc: number;
        };
      }>;
    };

    return {
      trending: data.coins.slice(0, 10).map((c) => ({
        id: c.item.id,
        name: c.item.name,
        symbol: c.item.symbol,
        marketCapRank: c.item.market_cap_rank,
      })),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'CoinGecko trending fetch failed');
    return { error: 'Failed to fetch trending tokens' };
  }
}

// ── Farcaster / Neynar (Social) ──────────────────────────────

const NEYNAR_BASE = 'https://api.neynar.com/v2/farcaster';

function getNeynarApiKey(): string {
  return process.env['NEYNAR_API_KEY'] ?? '';
}

async function getFarcasterTrending(_params: Record<string, unknown>): Promise<unknown> {
  const apiKey = getNeynarApiKey();
  if (!apiKey) {
    return { error: 'NEYNAR_API_KEY not configured' };
  }

  try {
    const res = await fetch(`${NEYNAR_BASE}/feed/trending?limit=10`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      throw new Error(`Neynar trending API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      casts: Array<{
        hash: string;
        text: string;
        author: { fid: number; username: string };
        reactions: { likes_count: number; recasts_count: number };
      }>;
    };

    return {
      trending: data.casts.slice(0, 10).map((cast) => ({
        hash: cast.hash,
        text: cast.text.slice(0, 200),
        author: cast.author.username,
        fid: cast.author.fid,
        likes: cast.reactions.likes_count,
        recasts: cast.reactions.recasts_count,
      })),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Neynar trending fetch failed');
    return { error: 'Failed to fetch Farcaster trending casts' };
  }
}

async function searchFarcasterCasts(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params['query'] ?? '');
  const limit = Number(params['limit'] ?? 10);
  const apiKey = getNeynarApiKey();

  if (!apiKey) {
    return { error: 'NEYNAR_API_KEY not configured' };
  }

  if (!query) {
    return { error: 'Search query is required' };
  }

  try {
    const res = await fetch(
      `${NEYNAR_BASE}/cast/search?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 20)}`,
      { headers: { 'x-api-key': apiKey } },
    );

    if (!res.ok) {
      throw new Error(`Neynar search API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      result: {
        casts: Array<{
          hash: string;
          text: string;
          author: { fid: number; username: string };
          reactions: { likes_count: number; recasts_count: number };
        }>;
      };
    };

    return {
      query,
      results: data.result.casts.map((cast) => ({
        hash: cast.hash,
        text: cast.text.slice(0, 200),
        author: cast.author.username,
        fid: cast.author.fid,
        likes: cast.reactions.likes_count,
        recasts: cast.reactions.recasts_count,
      })),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ query, error: error instanceof Error ? error.message : String(error) }, 'Neynar search failed');
    return { error: `Failed to search Farcaster for "${query}"` };
  }
}

// ── Base Chain (On-chain Data) ───────────────────────────────

async function getWalletBalance(params: Record<string, unknown>): Promise<unknown> {
  const address = String(params['address'] ?? '');

  if (!address || !address.startsWith('0x')) {
    return { error: 'Valid Ethereum address (0x...) is required' };
  }

  const rpcUrl = process.env['BASE_RPC_URL'] ?? 'https://mainnet.base.org';

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });

    const data = (await res.json()) as { result: string };
    const balanceWei = BigInt(data.result);
    const balanceEth = Number(balanceWei) / 1e18;

    return {
      address,
      balanceWei: balanceWei.toString(),
      balanceEth: balanceEth.toFixed(6),
      chain: 'Base',
    };
  } catch (error) {
    logger.error({ address, error: error instanceof Error ? error.message : String(error) }, 'Base RPC balance fetch failed');
    return { error: `Failed to fetch balance for ${address}` };
  }
}

async function getBlockNumber(_params: Record<string, unknown>): Promise<unknown> {
  const rpcUrl = process.env['BASE_RPC_URL'] ?? 'https://mainnet.base.org';

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
    });

    const data = (await res.json()) as { result: string };
    const blockNumber = parseInt(data.result, 16);

    return {
      blockNumber,
      blockHex: data.result,
      chain: 'Base',
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Base RPC block number fetch failed');
    return { error: 'Failed to fetch Base block number' };
  }
}

// ── Compute (AI Services) ────────────────────────────────────

async function generateImage(params: Record<string, unknown>): Promise<unknown> {
  const prompt = String(params['prompt'] ?? '');

  if (!prompt) {
    return { error: 'Image prompt is required' };
  }

  const falKey = process.env['FAL_KEY'] ?? '';
  if (!falKey) {
    return { error: 'FAL_KEY not configured' };
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_16_9',
        num_inference_steps: 4,
        num_images: 1,
      }),
    });

    if (!res.ok) {
      throw new Error(`Fal.ai API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      images: Array<{ url: string; width: number; height: number }>;
    };

    const image = data.images[0];
    return {
      url: image?.url ?? null,
      width: image?.width,
      height: image?.height,
      prompt,
    };
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Fal.ai image generation failed');
    return { error: `Image generation failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ── Default Tool Registration ────────────────────────────────

/**
 * Register all built-in tools with the registry.
 * Call this once during runtime bootstrap.
 */
export function registerDefaultTools(registry: ToolRegistry): void {
  const tools: ToolDefinition[] = [
    // ── Market Data (FREE tier) ──────────────────────────
    {
      id: 'get_token_price',
      name: 'Get Token Price',
      description: 'Fetch the current USD price, 24h change, and market cap for a cryptocurrency by its symbol (e.g. ETH, BTC, SOL, DEGEN).',
      category: ToolCategory.MARKET_DATA,
      tier: ToolTier.FREE,
      costMicroUsdc: 1_000n, // $0.001
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'The token symbol (e.g. "ETH", "BTC", "SOL", "DEGEN")',
          },
        },
        required: ['symbol'],
      },
      execute: getTokenPrice,
      timeoutMs: 10_000,
    },
    {
      id: 'get_trending_tokens',
      name: 'Get Trending Tokens',
      description: 'Fetch the top 10 trending cryptocurrency tokens from CoinGecko. Use this to discover what tokens are gaining attention.',
      category: ToolCategory.MARKET_DATA,
      tier: ToolTier.FREE,
      costMicroUsdc: 1_000n, // $0.001
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: getTrendingTokens,
      timeoutMs: 10_000,
    },

    // ── Social / Farcaster (STANDARD tier) ───────────────
    {
      id: 'get_farcaster_trending',
      name: 'Get Farcaster Trending',
      description: 'Fetch the top 10 trending casts (posts) on Farcaster. Use this to understand what topics are popular on the decentralized social network.',
      category: ToolCategory.SOCIAL,
      tier: ToolTier.STANDARD,
      costMicroUsdc: 10_000n, // $0.01
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: getFarcasterTrending,
      timeoutMs: 15_000,
    },
    {
      id: 'search_farcaster_casts',
      name: 'Search Farcaster Casts',
      description: 'Search Farcaster casts (posts) by keyword query. Returns matching casts with author info and engagement metrics.',
      category: ToolCategory.SOCIAL,
      tier: ToolTier.STANDARD,
      costMicroUsdc: 10_000n, // $0.01
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query (e.g. "Base ecosystem", "NFT alpha")',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (1-20, default 10)',
          },
        },
        required: ['query'],
      },
      execute: searchFarcasterCasts,
      timeoutMs: 15_000,
    },

    // ── Chain / Base (STANDARD tier) ─────────────────────
    {
      id: 'get_wallet_balance',
      name: 'Get Wallet Balance',
      description: 'Fetch the ETH balance for any wallet address on Base chain.',
      category: ToolCategory.CHAIN,
      tier: ToolTier.STANDARD,
      costMicroUsdc: 10_000n, // $0.01
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'The Ethereum wallet address (0x...)',
          },
        },
        required: ['address'],
      },
      execute: getWalletBalance,
      timeoutMs: 10_000,
    },
    {
      id: 'get_base_block_number',
      name: 'Get Base Block Number',
      description: 'Fetch the latest block number on Base chain. Use this to check chain liveness or reference specific blocks.',
      category: ToolCategory.CHAIN,
      tier: ToolTier.FREE,
      costMicroUsdc: 1_000n, // $0.001
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: getBlockNumber,
      timeoutMs: 10_000,
    },

    // ── Compute / AI (PREMIUM tier) ──────────────────────
    {
      id: 'generate_image',
      name: 'Generate Image',
      description: 'Generate an AI image from a text prompt using Fal.ai Flux. Use this to create visual content for social media posts.',
      category: ToolCategory.COMPUTE,
      tier: ToolTier.PREMIUM,
      costMicroUsdc: 50_000n, // $0.05
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'A detailed text description of the image to generate',
          },
        },
        required: ['prompt'],
      },
      execute: generateImage,
      timeoutMs: 60_000, // Image gen can take up to 60s
    },
  ];

  for (const tool of tools) {
    registry.register(tool);
  }

  logger.info({ toolCount: tools.length }, 'Default tools registered');
}
