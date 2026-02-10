import { z } from 'zod';

/**
 * x402 Payment Protocol Configuration
 *
 * All USDC amounts are expressed in 6 decimal units (1 USDC = 1_000_000).
 * Environment variables are validated at startup via Zod.
 */

const x402EnvSchema = z.object({
  X402_FACILITATOR_URL: z.string().url(),
  X402_RESOURCE_WALLET: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().default(8453),
  NEXT_PUBLIC_USDC_CONTRACT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

function loadX402Env(): z.infer<typeof x402EnvSchema> {
  const result = x402EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Soft-fail during build to allow pre-rendering
    console.warn(
      `[x402] Missing or invalid environment variables:\n${result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`
    );
    return {
      X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL || 'https://x402.coinbase.com',
      X402_RESOURCE_WALLET: process.env.X402_RESOURCE_WALLET || '0x0000000000000000000000000000000000000000',
      NEXT_PUBLIC_CHAIN_ID: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 84532,
      NEXT_PUBLIC_USDC_CONTRACT: process.env.NEXT_PUBLIC_USDC_CONTRACT || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    };
  }
  return result.data;
}

let _cachedEnv: z.infer<typeof x402EnvSchema> | null = null;

function getEnv(): z.infer<typeof x402EnvSchema> {
  if (!_cachedEnv) {
    _cachedEnv = loadX402Env();
  }
  return _cachedEnv;
}

/** Core x402 configuration derived from environment variables. */
export const X402_CONFIG = {
  get facilitatorUrl(): string {
    return getEnv().X402_FACILITATOR_URL;
  },
  get resourceWallet(): string {
    return getEnv().X402_RESOURCE_WALLET;
  },
  get network(): string {
    return 'base';
  },
  get chainId(): number {
    return getEnv().NEXT_PUBLIC_CHAIN_ID;
  },
  get usdcContract(): string {
    return getEnv().NEXT_PUBLIC_USDC_CONTRACT;
  },
} as const;

/**
 * USDC amounts in 6-decimal micro-units.
 * 1 USDC = 1_000_000
 */
export const USDC_DECIMALS = 6;

/** Convert a human-readable dollar amount to USDC micro-units. */
export function toUsdcUnits(dollars: number): bigint {
  return BigInt(Math.round(dollars * 10 ** USDC_DECIMALS));
}

/** Convert USDC micro-units to a human-readable dollar string. */
export function fromUsdcUnits(units: bigint): string {
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = units / divisor;
  const fraction = units % divisor;
  const fractionStr = fraction.toString().padStart(USDC_DECIMALS, '0');
  return `${whole}.${fractionStr}`;
}

/**
 * Route pricing map.
 *
 * Keys are URL path prefixes matched by the middleware.
 * Values are USDC amounts in 6-decimal micro-units.
 */
export const ROUTE_PRICING: ReadonlyMap<string, bigint> = new Map<string, bigint>([
  ['/api/skills/premium', toUsdcUnits(0.005)],
  ['/api/deploy/usdc', toUsdcUnits(10)],
  ['/api/analytics/pro', toUsdcUnits(0.01)],
  ['/api/v1', toUsdcUnits(0.001)],
]);

/** The set of route prefixes that are x402-gated, for middleware matching. */
export const X402_ROUTE_PREFIXES: readonly string[] = Array.from(ROUTE_PRICING.keys());

/** Payment requirements sent in the 402 response header. */
export interface PaymentRequirements {
  readonly scheme: 'x402';
  readonly network: string;
  readonly maxAmountRequired: string;
  readonly resource: string;
  readonly description: string;
  readonly usdcContract: string;
  readonly payTo: string;
  readonly facilitatorUrl: string;
  readonly chainId: number;
}

/**
 * Look up the USDC price for a given route pathname.
 *
 * Matches by prefix: `/api/analytics/pro/abc123` matches `/api/analytics/pro`.
 *
 * @returns The price in USDC micro-units, or `null` if the route is not x402-gated.
 */
export function getRoutePrice(pathname: string): bigint | null {
  for (const [prefix, price] of ROUTE_PRICING) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return price;
    }
  }
  return null;
}

/**
 * Build full PaymentRequirements for a route.
 *
 * @returns Requirements object or `null` if the route has no price.
 */
export function buildPaymentRequirements(
  pathname: string,
  resourceUrl: string
): PaymentRequirements | null {
  const price = getRoutePrice(pathname);
  if (price === null) {
    return null;
  }

  return {
    scheme: 'x402',
    network: X402_CONFIG.network,
    maxAmountRequired: price.toString(),
    resource: resourceUrl,
    description: `Payment of ${fromUsdcUnits(price)} USDC for ${pathname}`,
    usdcContract: X402_CONFIG.usdcContract,
    payTo: X402_CONFIG.resourceWallet,
    facilitatorUrl: X402_CONFIG.facilitatorUrl,
    chainId: X402_CONFIG.chainId,
  };
}
