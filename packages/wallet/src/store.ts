/**
 * @repo/wallet — WalletStore
 *
 * MPC-only wallet management for Sovereign AI Agents.
 * Uses Coinbase CDP SDK for wallet creation, and AES-256-GCM
 * for encrypting cdpWalletData before DB persistence.
 *
 * Key design decisions:
 * - NO raw private keys anywhere. Period.
 * - cdpWalletData is exported from CDP, encrypted, then stored.
 * - Wallet recovery is always possible via decrypt → Wallet.import().
 * - DB operations use a PrismaClient-compatible interface.
 */
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { encryptForStorage, decryptFromStorage } from './crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletProvisionResult {
  walletId: string;
  address: string;
  email: string;
  network: string;
}

export interface WalletPaymentResult {
  txHash: string;
  amount: string;
}

export interface WalletFundResult {
  txHash: string;
}

/**
 * Minimal Prisma-compatible interface for Agent model.
 * We only depend on the fields we use — keeps the package decoupled.
 */
interface AgentRecord {
  id: string;
  name: string;
  walletId: string | null;
  walletAddress: string | null;
  walletEmail: string | null;
  cdpWalletData: string | null;
}

/**
 * PrismaClient-compatible interface.
 * We depend on the shape, not the concrete PrismaClient class.
 */
export interface WalletPrismaClient {
  agent: {
    findUnique: (args: {
      where: { id: string };
      select?: Record<string, boolean>;
    }) => Promise<AgentRecord | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<AgentRecord>;
  };
}

// ---------------------------------------------------------------------------
// CDP Client Singleton
// ---------------------------------------------------------------------------

let _cdpClient: Coinbase | null = null;

function getCdpClient(): Coinbase {
  if (!_cdpClient) {
    const apiKeyName = process.env.CDP_API_KEY_NAME;
    const apiKeyPrivateKey = process.env.CDP_API_KEY_PRIVATE_KEY;

    if (!apiKeyName || !apiKeyPrivateKey) {
      throw new Error(
        '[WalletStore] CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY must be set. ' +
          'Get credentials from https://portal.cdp.coinbase.com/',
      );
    }

    _cdpClient = new Coinbase({ apiKeyName, privateKey: apiKeyPrivateKey });
  }
  return _cdpClient;
}

function getNetworkId(): string {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '84532');
  return chainId === 8453 ? 'base-mainnet' : 'base-sepolia';
}

function getEmailDomain(): string {
  return process.env.AWAL_EMAIL_DOMAIN ?? 'agents.ceos.run';
}

// ---------------------------------------------------------------------------
// WalletStore Factory
// ---------------------------------------------------------------------------

export interface WalletStore {
  /**
   * Provision a new MPC wallet for an agent.
   * Creates CDP wallet → exports cdpWalletData → encrypts → stores in DB.
   * This is the ONLY way to create agent wallets.
   */
  provisionWallet(agentId: string): Promise<WalletProvisionResult>;

  /**
   * Recover an existing wallet from encrypted DB storage.
   * Loads cdpWalletData → decrypts → Wallet.import().
   */
  recoverWallet(agentId: string): Promise<Wallet>;

  /**
   * Fund an agent wallet (testnet faucet only; mainnet requires manual transfer).
   */
  fundWallet(agentId: string, amount: string, currency?: string): Promise<WalletFundResult>;

  /**
   * Execute a USDC payment from an agent wallet (x402 service payment).
   * Triggers Buyback & Burn accounting when service payment settles.
   */
  executePayment(
    agentId: string,
    recipientAddress: string,
    amountUsdc: string,
    serviceUrl: string,
  ): Promise<WalletPaymentResult>;
}

export function createWalletStore(prisma: WalletPrismaClient): WalletStore {
  // Use object with methods that reference each other via `store`
  const store: WalletStore = {
    // -----------------------------------------------------------------------
    // provisionWallet
    // -----------------------------------------------------------------------
    async provisionWallet(agentId: string): Promise<WalletProvisionResult> {
      getCdpClient(); // Validate credentials early

      const networkId = getNetworkId();
      const email = `${agentId}@${getEmailDomain()}`;

      // 1. Create MPC wallet via CDP
      const wallet = await Wallet.create({ networkId });
      const defaultAddress = await wallet.getDefaultAddress();
      const walletId = wallet.getId() ?? '';
      const address = defaultAddress.getId();

      // 2. Export wallet data (contains key shares — NEVER store unencrypted)
      const exportData = wallet.export();
      const exportJson = JSON.stringify(exportData);

      // 3. Encrypt with AES-256-GCM before DB storage
      const encryptedData = encryptForStorage(exportJson);

      // 4. Persist everything to DB — walletId for reference, encrypted data for recovery
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          walletId,
          walletAddress: address,
          walletEmail: email,
          cdpWalletData: encryptedData,
          // Defaults from env (can be updated per-agent via PATCH /agents/:id/wallet)
          walletSessionLimit: Number(process.env.AWAL_DEFAULT_SESSION_LIMIT ?? '50'),
          walletTxLimit: Number(process.env.AWAL_DEFAULT_TX_LIMIT ?? '10'),
        },
      });

      return { walletId, address, email, network: networkId };
    },

    // -----------------------------------------------------------------------
    // recoverWallet
    // -----------------------------------------------------------------------
    async recoverWallet(agentId: string): Promise<Wallet> {
      getCdpClient();

      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          name: true,
          walletId: true,
          walletAddress: true,
          walletEmail: true,
          cdpWalletData: true,
        },
      });

      if (!agent) {
        throw new Error(`[WalletStore] Agent not found: ${agentId}`);
      }

      // Prefer encrypted cdpWalletData (new path)
      if (agent.cdpWalletData) {
        const decrypted = decryptFromStorage(agent.cdpWalletData);
        const walletData = JSON.parse(decrypted);
        return Wallet.import(walletData);
      }

      // Fallback: try fetching by walletId (legacy agents without cdpWalletData)
      if (agent.walletId) {
        console.warn(
          `[WalletStore] Agent ${agentId} has walletId but no cdpWalletData. ` +
            'This is a legacy wallet — recovery depends on CDP server state. ' +
            'Re-provision recommended.',
        );
        return Wallet.fetch(agent.walletId);
      }

      throw new Error(
        `[WalletStore] Agent ${agentId} has no wallet data. ` +
          'Call provisionWallet() first.',
      );
    },

    // -----------------------------------------------------------------------
    // fundWallet
    // -----------------------------------------------------------------------
    async fundWallet(
      agentId: string,
      _amount: string,
      currency: string = 'usdc',
    ): Promise<WalletFundResult> {
      const wallet = await store.recoverWallet(agentId);
      const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '84532');

      if (chainId === 8453) {
        throw new Error(
          '[WalletStore] Mainnet funding requires manual USDC transfer to the agent wallet address. ' +
            'Faucet is only available on testnet.',
        );
      }

      const faucetTx = await wallet.faucet(currency);
      return { txHash: faucetTx.getTransactionHash() ?? '' };
    },

    // -----------------------------------------------------------------------
    // executePayment
    // -----------------------------------------------------------------------
    async executePayment(
      agentId: string,
      recipientAddress: string,
      amountUsdc: string,
      serviceUrl: string,
    ): Promise<WalletPaymentResult> {
      const wallet = await store.recoverWallet(agentId);

      const transfer = await wallet.createTransfer({
        amount: parseFloat(amountUsdc),
        assetId: 'usdc',
        destination: recipientAddress,
      });

      await transfer.wait();

      const txHash = transfer.getTransactionHash() ?? '';

      // TODO: Trigger Buyback & Burn accounting
      // When Agent→Agent service payment settles, 2% of the amount
      // should be routed to $RUN buyback via AgentTreasury contract.
      // Log for RLAIF: { agentId, type: 'x402_payment', amount, serviceUrl, txHash }

      return { txHash, amount: amountUsdc };
    },
  };

  return store;
}
