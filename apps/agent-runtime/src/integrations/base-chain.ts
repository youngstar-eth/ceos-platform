import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Address,
  type Abi,
  type Log,
  type Chain,
  type WatchContractEventReturnType,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import pino from 'pino';
import { logger as rootLogger } from '../config.js';

interface BaseChainConfig {
  rpcUrl: string;
  chainId: number;
}

interface AgentOnChainStatus {
  exists: boolean;
  owner: Address | null;
  deployedAt: bigint | null;
  isActive: boolean;
}

interface CreatorScoreData {
  score: bigint;
  epoch: bigint;
  lastUpdated: bigint;
}

export class BaseChainClient {
  private readonly client: PublicClient;
  private readonly logger: pino.Logger;
  private readonly chainId: number;
  private readonly chain: Chain;
  private readonly rpcUrl: string;
  private readonly activeWatchers: Map<string, WatchContractEventReturnType> = new Map();
  private walletClient: WalletClient | null = null;
  private account: PrivateKeyAccount | null = null;

  constructor(chainConfig: BaseChainConfig) {
    this.chain = chainConfig.chainId === 8453 ? base : baseSepolia;
    this.rpcUrl = chainConfig.rpcUrl;

    this.client = createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });

    this.chainId = chainConfig.chainId;
    this.logger = rootLogger.child({ module: 'BaseChainClient', chainId: this.chainId });

    this.logger.info({ chainId: this.chainId, rpcUrl: chainConfig.rpcUrl }, 'Base chain client initialized');
  }

  async readContract<T>(params: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<T> {
    this.logger.debug(
      { address: params.address, functionName: params.functionName },
      'Reading contract',
    );

    try {
      const result = await this.client.readContract({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
      });

      return result as T;
    } catch (error) {
      this.logger.error(
        {
          address: params.address,
          functionName: params.functionName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Contract read failed',
      );
      throw error;
    }
  }

  watchContractEvent(params: {
    address: Address;
    abi: Abi;
    eventName: string;
    onLogs: (logs: Log[]) => void;
    watcherId?: string;
  }): string {
    const watcherId = params.watcherId ?? `${params.address}-${params.eventName}-${Date.now()}`;

    this.logger.info(
      { watcherId, address: params.address, eventName: params.eventName },
      'Starting contract event watcher',
    );

    const unwatch = this.client.watchContractEvent({
      address: params.address,
      abi: params.abi,
      eventName: params.eventName,
      onLogs: (logs) => {
        this.logger.debug(
          { watcherId, eventCount: logs.length },
          'Contract events received',
        );
        params.onLogs(logs);
      },
      onError: (error) => {
        this.logger.error(
          { watcherId, error: error.message },
          'Contract event watcher error',
        );
      },
    });

    this.activeWatchers.set(watcherId, unwatch);
    return watcherId;
  }

  stopWatcher(watcherId: string): boolean {
    const unwatch = this.activeWatchers.get(watcherId);
    if (unwatch) {
      unwatch();
      this.activeWatchers.delete(watcherId);
      this.logger.info({ watcherId }, 'Contract event watcher stopped');
      return true;
    }
    return false;
  }

  async getAgentOnChainStatus(
    registryAddress: Address,
    registryAbi: Abi,
    agentId: string,
  ): Promise<AgentOnChainStatus> {
    this.logger.debug({ agentId, registryAddress }, 'Fetching agent on-chain status');

    try {
      const result = await this.readContract<[boolean, Address, bigint, boolean]>({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'getAgent',
        args: [agentId],
      });

      return {
        exists: result[0],
        owner: result[1],
        deployedAt: result[2],
        isActive: result[3],
      };
    } catch (error) {
      this.logger.warn(
        { agentId, error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch agent on-chain status',
      );

      return {
        exists: false,
        owner: null,
        deployedAt: null,
        isActive: false,
      };
    }
  }

  async getCreatorScore(
    creatorScoreAddress: Address,
    creatorScoreAbi: Abi,
    creatorAddress: Address,
  ): Promise<CreatorScoreData> {
    this.logger.debug({ creatorAddress }, 'Fetching creator score');

    try {
      const result = await this.readContract<[bigint, bigint, bigint]>({
        address: creatorScoreAddress,
        abi: creatorScoreAbi,
        functionName: 'getCreatorScore',
        args: [creatorAddress],
      });

      return {
        score: result[0],
        epoch: result[1],
        lastUpdated: result[2],
      };
    } catch (error) {
      this.logger.warn(
        { creatorAddress, error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch creator score',
      );

      return {
        score: 0n,
        epoch: 0n,
        lastUpdated: 0n,
      };
    }
  }

  async getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  async getChainId(): Promise<number> {
    return this.client.getChainId();
  }

  initializeWallet(privateKey: string): void {
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });

    this.logger.info(
      { address: this.account.address },
      'Wallet client initialized for on-chain writes',
    );
  }

  isWalletInitialized(): boolean {
    return this.walletClient !== null && this.account !== null;
  }

  getAccountAddress(): Address | null {
    return this.account?.address ?? null;
  }

  async writeContract(params: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }): Promise<`0x${string}`> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not initialized — call initializeWallet() first');
    }

    this.logger.info(
      { address: params.address, functionName: params.functionName },
      'Writing to contract',
    );

    try {
      // Simulate first to catch reverts without spending gas
      const { request } = await this.client.simulateContract({
        account: this.account,
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        value: params.value,
      });

      // Execute the actual transaction
      const txHash = await this.walletClient.writeContract(request);

      this.logger.info(
        { address: params.address, functionName: params.functionName, txHash },
        'Contract write successful',
      );

      return txHash;
    } catch (error) {
      this.logger.error(
        {
          address: params.address,
          functionName: params.functionName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Contract write failed',
      );
      throw error;
    }
  }

  async waitForTransaction(txHash: `0x${string}`): Promise<{ status: 'success' | 'reverted'; blockNumber: bigint }> {
    const receipt = await this.client.waitForTransactionReceipt({ hash: txHash });
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
    };
  }

  stopAllWatchers(): void {
    for (const [watcherId, unwatch] of this.activeWatchers.entries()) {
      unwatch();
      this.logger.debug({ watcherId }, 'Watcher stopped');
    }
    this.activeWatchers.clear();
    this.logger.info('All contract event watchers stopped');
  }
}

export type { BaseChainConfig, AgentOnChainStatus, CreatorScoreData };
