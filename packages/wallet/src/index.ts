/**
 * @repo/wallet — Shared MPC Wallet Package
 *
 * Provides secure wallet management for all ceos.run apps:
 * - apps/web (deploy routes, dashboard)
 * - apps/agent-runtime (autonomous tx execution)
 *
 * Architecture:
 *   createWalletStore(prisma) → WalletStore instance
 *   WalletStore.provisionWallet()  → Create + encrypt + persist
 *   WalletStore.recoverWallet()    → Decrypt + import from DB
 *   WalletStore.fundWallet()       → Testnet faucet
 *   WalletStore.executePayment()   → x402 USDC transfer
 */
export { createWalletStore } from './store';
export type {
  WalletStore,
  WalletPrismaClient,
  WalletProvisionResult,
  WalletPaymentResult,
  WalletFundResult,
} from './store';

export {
  encryptWalletData,
  decryptWalletData,
  encryptForStorage,
  decryptFromStorage,
} from './crypto';
export type { EncryptedPayload } from './crypto';
