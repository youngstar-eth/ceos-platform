import { z } from 'zod';
import pino from 'pino';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load root .env file (agent-runtime runs from apps/agent-runtime/)
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  FAL_KEY: z.string().min(1, 'FAL_KEY is required'),
  NEYNAR_API_KEY: z.string().min(1, 'NEYNAR_API_KEY is required'),
  NEYNAR_WALLET_ID: z.string().min(1, 'NEYNAR_WALLET_ID is required for account creation').optional(),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required').default('redis://localhost:6379'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BASE_RPC_URL: DEMO_MODE
    ? z.string().url().optional().default('https://sepolia.base.org')
    : z.string().url('BASE_RPC_URL must be a valid URL'),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().default(8453),
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const logger = pino({ name: 'config' });
    logger.fatal({ errors: formatted }, 'Invalid environment configuration');
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }

  return result.data;
}

export const config = loadConfig();

export const logger = pino({
  name: 'ceosrun-runtime',
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
