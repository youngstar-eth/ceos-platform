import { z } from 'zod';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const serverEnvSchema = z.object({
  // AI Services
  OPENROUTER_API_KEY: z.string().min(1),
  FAL_KEY: z.string().min(1),

  // Social
  NEYNAR_API_KEY: z.string().min(1),
  NEYNAR_WALLET_ID: z.string().optional(),
  NEYNAR_WEBHOOK_SECRET: DEMO_MODE
    ? z.string().optional().default('demo-webhook-secret')
    : z.string().min(1),

  // Blockchain
  BASE_RPC_URL: DEMO_MODE
    ? z.string().url().optional().default('https://sepolia.base.org')
    : z.string().url(),
  BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
  DEPLOYER_PRIVATE_KEY: DEMO_MODE
    ? z
        .string()
        .optional()
        .default('0x0000000000000000000000000000000000000000000000000000000000000001')
    : z.string().min(1),

  // x402 Payment Protocol
  X402_FACILITATOR_URL: DEMO_MODE
    ? z.string().url().optional().default('https://x402.coinbase.com')
    : z.string().url(),
  X402_RESOURCE_WALLET: DEMO_MODE
    ? z.string().optional().default('0x0000000000000000000000000000000000000000')
    : z.string().regex(/^0x[a-fA-F0-9]{40}$/),

  // CDP / Awal Wallet
  CDP_API_KEY_NAME: z.string().min(1).optional(),
  CDP_API_KEY_PRIVATE_KEY: z.string().min(1).optional(),
  AWAL_EMAIL_DOMAIN: z.string().default('agents.ceos.run'),
  AWAL_DEFAULT_SESSION_LIMIT: z.coerce.number().default(50),
  AWAL_DEFAULT_TX_LIMIT: z.coerce.number().default(10),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),
});

const clientEnvSchema = z.object({
  // App Config
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://ceos.run'),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().default(8453),
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
  NEXT_PUBLIC_APP_VERSION: z.string().optional(),

  // Contract addresses (optional until deployed)
  NEXT_PUBLIC_FACTORY_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_REGISTRY_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_REVENUE_POOL_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_CREATOR_SCORE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_X402_GATE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_USDC_CONTRACT: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

function validateEnv(): { server: ServerEnv; client: ClientEnv } {
  const serverResult = serverEnvSchema.safeParse(process.env);
  const clientResult = clientEnvSchema.safeParse(process.env);

  const errors: string[] = [];

  if (!serverResult.success) {
    errors.push(
      ...serverResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  if (!clientResult.success) {
    errors.push(
      ...clientResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  if (errors.length > 0) {
    if (typeof window === 'undefined') {
      console.warn('[env] Environment validation issues:\n' + errors.join('\n'));
    }

    // Only throw at runtime, not during build (NEXT_PHASE indicates build-time)
    const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
    if (process.env.NODE_ENV === 'production' && serverResult.success === false && !isBuildPhase) {
      throw new Error(`Missing or invalid environment variables:\n${errors.join('\n')}`);
    }
  }

  return {
    server: serverResult.success
      ? serverResult.data
      : (process.env as unknown as ServerEnv),
    client: clientResult.success
      ? clientResult.data
      : (process.env as unknown as ClientEnv),
  };
}

const validated = validateEnv();

/** Validated server-side environment variables. */
export const serverEnv = validated.server;

/** Validated client-side environment variables. */
export const clientEnv = validated.client;

/**
 * Backwards-compatible export — existing code imports `env` directly.
 * This returns the merged server + client env for convenience.
 */
export const env = { ...validated.server, ...validated.client } as ServerEnv & ClientEnv;

/** Re-export the combined type for backwards compat. */
export type Env = ServerEnv & ClientEnv;
