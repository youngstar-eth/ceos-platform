/**
 * Wallet Store — Consumer Adapter for apps/web
 *
 * Bridges @repo/wallet to this app's Prisma instance.
 * Import this instead of @repo/wallet directly in route handlers.
 */
import { createWalletStore as createBaseStore } from '@repo/wallet';
import { prisma } from '@/lib/prisma';

// Singleton — one store per process lifetime
let _store: ReturnType<typeof createBaseStore> | null = null;

export function createWalletStore() {
  if (!_store) {
    _store = createBaseStore(prisma);
  }
  return _store;
}

export type { WalletStore, WalletProvisionResult } from '@repo/wallet';
