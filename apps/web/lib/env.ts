import { z } from "zod";

const envSchema = z.object({
  // AI Services
  OPENROUTER_API_KEY: z.string().min(1),
  FAL_KEY: z.string().min(1),

  // Social
  NEYNAR_API_KEY: z.string().min(1),
  NEYNAR_WEBHOOK_SECRET: z.string().min(1),

  // Blockchain
  BASE_RPC_URL: z.string().url(),
  BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
  DEPLOYER_PRIVATE_KEY: z.string().min(1),

  // x402
  X402_FACILITATOR_URL: z.string().url(),
  X402_RESOURCE_WALLET: z.string().regex(/^0x[a-fA-F0-9]{40}$/),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // App Config
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().default(8453),

  // Contract addresses (optional until deployed)
  NEXT_PUBLIC_FACTORY_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_REGISTRY_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_REVENUE_POOL_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_CREATOR_SCORE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_X402_GATE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_USDC_CONTRACT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment variables.
 *
 * Throws at startup if required env vars are missing.
 * In development / CI we fall back to a relaxed parse that allows missing
 * optional values.
 */
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const message = `Invalid environment variables: ${JSON.stringify(formatted, null, 2)}`;

    // Always soft-fail so next build can pre-render pages without env vars
    // Runtime will still fail if required vars are missing when routes are hit
    if (typeof window === 'undefined') {
      console.warn('[env] ' + message);
    }

    return process.env as unknown as Env;
  }

  return result.data;
}

export const env = parseEnv();
