/**
 * Coinbase Agentic Wallet (awal) client.
 * Agent deploy sırasında otomatik wallet provisioning yapar.
 */
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

interface WalletProvisionResult {
  walletId: string;
  address: string;
  email: string;
  network: string;
}

// Singleton CDP client
let cdpClient: Coinbase | null = null;

function getCdpClient(): Coinbase {
  if (!cdpClient) {
    const apiKeyName = serverEnv.CDP_API_KEY_NAME;
    const apiKeyPrivateKey = serverEnv.CDP_API_KEY_PRIVATE_KEY;

    if (!apiKeyName || !apiKeyPrivateKey) {
      throw new Error('CDP API credentials not configured');
    }

    cdpClient = new Coinbase({
      apiKeyName,
      privateKey: apiKeyPrivateKey,
    });
  }
  return cdpClient;
}

export async function provisionAgentWallet(
  agentId: string,
  _agentName: string,
): Promise<WalletProvisionResult> {
  getCdpClient(); // Ensure credentials are valid
  const email = `${agentId}@${serverEnv.AWAL_EMAIL_DOMAIN ?? 'agents.ceos.run'}`;

  logger.info({ agentId, email }, 'Provisioning awal wallet');

  // Network: base-mainnet (production) or base-sepolia (testnet)
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  const networkId = chainId === 8453
    ? 'base-mainnet'
    : 'base-sepolia';

  const wallet = await Wallet.create({ networkId });
  const address = await wallet.getDefaultAddress();

  logger.info(
    { agentId, address: address.getId(), network: networkId },
    'Awal wallet provisioned',
  );

  return {
    walletId: wallet.getId() ?? '',
    address: address.getId(),
    email,
    network: networkId,
  };
}

export async function getAgentWallet(walletId: string): Promise<Wallet> {
  getCdpClient();
  return Wallet.fetch(walletId);
}

export async function fundAgentWallet(
  walletId: string,
  _amount: string,
  currency: string = 'usdc',
): Promise<{ txHash: string }> {
  const wallet = await getAgentWallet(walletId);

  // Faucet (testnet) or transfer (mainnet)
  const currentChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  if (currentChainId !== 8453) {
    const faucetTx = await wallet.faucet(currency);
    return { txHash: faucetTx.getTransactionHash() ?? '' };
  }

  throw new Error('Mainnet funding requires manual USDC transfer');
}

export async function executeX402Payment(
  walletId: string,
  recipientAddress: string,
  amountUsdc: string,
  serviceUrl: string,
): Promise<{ txHash: string; amount: string }> {
  const wallet = await getAgentWallet(walletId);
  const transfer = await wallet.createTransfer({
    amount: parseFloat(amountUsdc),
    assetId: 'usdc',
    destination: recipientAddress,
  });

  await transfer.wait();

  logger.info(
    { walletId, recipient: recipientAddress, amount: amountUsdc, serviceUrl },
    'x402 payment executed',
  );

  return {
    txHash: transfer.getTransactionHash() ?? '',
    amount: amountUsdc,
  };
}
