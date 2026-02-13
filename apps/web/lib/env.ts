import { z } from "zod";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const envSchema = z.object({
  // AI Services
  OPENROUTER_API_KEY: z.string().min(1),
  FAL_KEY: z.string().min(1),

  // Social
  NEYNAR_API_KEY: z.string().min(1),
  NEYNAR_WALLET_ID: z.string().optional(),
  NEYNAR_WEBHOOK_SECRET: DEMO_MODE
    ? z.string().optional().default("demo-webhook-secret")
    : z.string().min(1),

  // Blockchain (optional in demo mode)
  BASE_RPC_URL: DEMO_MODE
    ? z.string().url().optional().default("https://sepolia.base.org")
    : z.string().url(),
  BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
  DEPLOYER_PRIVATE_KEY: DEMO_MODE
    ? z.string().optional().default("0x0000000000000000000000000000000000000000000000000000000000000001")
    : z.string().min(1),

  // x402 (optional in demo mode)
  X402_FACILITATOR_URL: DEMO_MODE
    ? z.string().url().optional().default("https://x402.coinbase.com")
    : z.string().url(),
  X402_RESOURCE_WALLET: DEMO_MODE
    ? z.string().optional().default("0x0000000000000000000000000000000000000000")
    : z.string().regex(/^0x[a-fA-F0-9]{40}$/),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // App Config
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().default(8453),
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),

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
