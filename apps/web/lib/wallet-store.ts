/**
 * Wallet Store — Consumer Adapter for apps/web
 *
 * Bridges @repo/wallet to this app's Prisma instance.
 * Import this instead of @repo/wallet directly in route handlers.
 *
 * Accepts a PrismaClient instance so the caller controls the DB connection.
 * Falls back to the app-level singleton when no argument is provided.
 */
import {
  createWalletStore as createBaseStore,
  type WalletPrismaClient,
} from '@repo/wallet';
import { prisma as defaultPrisma } from '@/lib/prisma';

/**
 * Create (or return cached) WalletStore.
 *
 * @param prismaClient - Optional Prisma instance. Defaults to the
 *   app-level singleton (`@/lib/prisma`). Pass explicitly in contexts
 *   where you need a different client (e.g., transaction-scoped).
 */
export function createWalletStore(prismaClient?: WalletPrismaClient) {
  return createBaseStore(prismaClient ?? defaultPrisma);
}

export type { WalletStore, WalletProvisionResult } from '@repo/wallet';
