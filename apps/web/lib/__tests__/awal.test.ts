import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the CDP SDK
vi.mock('@coinbase/coinbase-sdk', () => {
  const mockAddress = {
    getId: vi.fn(() => '0xmockWalletAddress123'),
  };
  const mockWallet = {
    getId: vi.fn(() => 'wallet-id-123'),
    getDefaultAddress: vi.fn(() => Promise.resolve(mockAddress)),
    faucet: vi.fn(() => Promise.resolve({ getTransactionHash: () => 'tx-hash-faucet' })),
    createTransfer: vi.fn(() => Promise.resolve({
      wait: vi.fn(() => Promise.resolve()),
      getTransactionHash: () => 'tx-hash-transfer',
    })),
  };
  return {
    Coinbase: vi.fn(() => ({})),
    Wallet: {
      create: vi.fn(() => Promise.resolve(mockWallet)),
      fetch: vi.fn(() => Promise.resolve(mockWallet)),
    },
  };
});

// Mock env
vi.mock('@/lib/env', () => ({
  serverEnv: {
    CDP_API_KEY_NAME: 'test-key-name',
    CDP_API_KEY_PRIVATE_KEY: 'test-private-key',
    AWAL_EMAIL_DOMAIN: 'agents.ceos.run',
    NEXT_PUBLIC_CHAIN_ID: 84532,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('awal client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provisionAgentWallet should return wallet address', async () => {
    const { provisionAgentWallet } = await import('@/lib/awal');
    const result = await provisionAgentWallet('agent-123', 'Test Agent');

    expect(result.address).toBe('0xmockWalletAddress123');
    expect(result.walletId).toBe('wallet-id-123');
    expect(result.email).toBe('agent-123@agents.ceos.run');
    expect(result.network).toBe('base-sepolia');
  });

  it('provisionAgentWallet should handle CDP API failure', async () => {
    const { Wallet } = await import('@coinbase/coinbase-sdk');
    (Wallet.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('CDP API timeout'),
    );

    const { provisionAgentWallet } = await import('@/lib/awal');
    await expect(provisionAgentWallet('agent-fail', 'Fail Agent')).rejects.toThrow(
      'CDP API timeout',
    );
  });

  it('executeX402Payment should create transfer', async () => {
    const { executeX402Payment } = await import('@/lib/awal');
    const result = await executeX402Payment(
      'wallet-id-123',
      '0xrecipient',
      '5.00',
      'https://api.example.com',
    );

    expect(result.txHash).toBe('tx-hash-transfer');
    expect(result.amount).toBe('5.00');
  });

  it('executeX402Payment should log transaction', async () => {
    const { logger } = await import('@/lib/logger');
    const { executeX402Payment } = await import('@/lib/awal');

    await executeX402Payment(
      'wallet-id-123',
      '0xrecipient',
      '10.00',
      'https://service.example.com',
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'wallet-id-123',
        recipient: '0xrecipient',
        amount: '10.00',
      }),
      'x402 payment executed',
    );
  });
});
