import { z } from 'zod';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Neynar v2 API — Typed client for Farcaster user lookups
//
// We use the REST API directly instead of the heavyweight @neynar/nodejs-sdk
// to keep the bundle lean. Only the endpoints we actually need are wrapped.
// ---------------------------------------------------------------------------

const NEYNAR_BASE_URL = 'https://api.neynar.com/v2/farcaster';

function getApiKey(): string {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) throw new Error('NEYNAR_API_KEY is not configured');
  return key;
}

// ── Response schemas ─────────────────────────────────────────────────────────

/** Subset of the Neynar user object we actually use. */
const neynarUserSchema = z.object({
  fid: z.number(),
  username: z.string(),
  display_name: z.string().nullable().optional(),
  pfp_url: z.string().url().nullable().optional(),
  profile: z
    .object({
      bio: z
        .object({
          text: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  follower_count: z.number().default(0),
  following_count: z.number().default(0),
  verifications: z.array(z.string()).default([]),
  verified_addresses: z
    .object({
      eth_addresses: z.array(z.string()).default([]),
      sol_addresses: z.array(z.string()).default([]),
    })
    .optional(),
  custody_address: z.string().nullable().optional(),
});

export type NeynarUser = z.output<typeof neynarUserSchema>;

/** Our clean, app-level representation of a Farcaster user. */
export interface FarcasterProfile {
  fid: number;
  username: string;
  displayName: string | null;
  bio: string | null;
  pfpUrl: string | null;
  followerCount: number;
  followingCount: number;
  verifiedEthAddresses: string[];
  custodyAddress: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toFarcasterProfile(user: NeynarUser): FarcasterProfile {
  return {
    fid: user.fid,
    username: user.username,
    displayName: user.display_name ?? null,
    bio: user.profile?.bio?.text ?? null,
    pfpUrl: user.pfp_url ?? null,
    followerCount: user.follower_count,
    followingCount: user.following_count,
    verifiedEthAddresses: user.verified_addresses?.eth_addresses ?? user.verifications ?? [],
    custodyAddress: user.custody_address ?? null,
  };
}

async function neynarFetch<T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.output<T>> {
  const url = `${NEYNAR_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': getApiKey(),
    },
    // Never cache user lookups — always get fresh data
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    logger.error({ status: res.status, url, body }, 'Neynar API error');
    throw new Error(`Neynar API returned ${res.status}: ${body}`);
  }

  const json: unknown = await res.json();
  return schema.parse(json);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up a Farcaster user by their username (e.g. "dwr.eth").
 *
 * Returns `null` if the user is not found (404) instead of throwing.
 */
export async function getFarcasterUser(username: string): Promise<FarcasterProfile | null> {
  try {
    const data = await neynarFetch(
      `/user/by_username?username=${encodeURIComponent(username)}`,
      z.object({ user: neynarUserSchema }),
    );
    return toFarcasterProfile(data.user);
  } catch (err) {
    // Neynar returns 404 for unknown usernames — treat as "not found"
    if (err instanceof Error && err.message.includes('404')) {
      logger.info({ username }, 'Farcaster user not found');
      return null;
    }
    throw err;
  }
}

/**
 * Look up a Farcaster user by their FID (numeric Farcaster ID).
 */
export async function getFarcasterUserByFid(fid: number): Promise<FarcasterProfile | null> {
  try {
    const data = await neynarFetch(
      `/user/bulk?fids=${fid}`,
      z.object({ users: z.array(neynarUserSchema) }),
    );
    const user = data.users[0];
    if (!user) return null;
    return toFarcasterProfile(user);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) {
      logger.info({ fid }, 'Farcaster user not found by FID');
      return null;
    }
    throw err;
  }
}

/**
 * Search for Farcaster users by a query string.
 * Useful for typeahead / autocomplete when entering a target handle.
 */
export async function searchFarcasterUsers(query: string, limit = 5): Promise<FarcasterProfile[]> {
  const data = await neynarFetch(
    `/user/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    z.object({
      result: z.object({
        users: z.array(neynarUserSchema),
      }),
    }),
  );
  return data.result.users.map(toFarcasterProfile);
}
