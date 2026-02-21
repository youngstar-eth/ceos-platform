/**
 * Trinity Deploy Adapter — Web-side bridge to the Trinity Deployer
 *
 * This adapter provides the dependency injection implementations
 * that the Trinity Deployer needs. It bridges:
 *   - @/lib/awal (CDP wallet provisioning)
 *   - The Neynar Farcaster account creation logic
 *   - ERC-8004 on-chain minting via the deployed ERC8004TrustRegistry
 *
 * The adapter lives in apps/web because the deploy route is a Next.js
 * API route. The Trinity Deployer itself lives in agent-runtime/src/services/
 * but is imported here as shared logic (both are pure Node.js/TypeScript).
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { CONTRACT_ADDRESSES, ERC8004_TRUST_REGISTRY_ABI } from '@/lib/contracts';
import type {
  TrinityDeployInput,
  TrinityDeployResult,
  TrinityDeps,
  CdpResult,
  FarcasterResult,
} from './trinity-deployer-types.js';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const NEYNAR_API_BASE = 'https://api.neynar.com/v2/farcaster';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY ?? '';
const NEYNAR_WALLET_ID = process.env.NEYNAR_WALLET_ID ?? '';

// ── CDP Wallet Provider ───────────────────────────────────────────────────

async function provisionWallet(agentId: string, agentName: string): Promise<CdpResult> {
  const { provisionAgentWallet } = await import('@/lib/awal');
  const result = await provisionAgentWallet(agentId, agentName);
  return {
    walletId: result.walletId,
    walletAddress: result.address,
    walletEmail: result.email,
    network: result.network,
  };
}

// ── Farcaster Account Provider ────────────────────────────────────────────

async function createFarcasterAccountDep(options: {
  walletId: string;
  username: string;
  displayName: string;
  bio: string;
  pfpUrl?: string;
  agentId: string;
}): Promise<FarcasterResult> {
  if (!NEYNAR_WALLET_ID) {
    throw new Error('NEYNAR_WALLET_ID not configured — Farcaster account creation unavailable');
  }

  const {
    ID_REGISTRY_ADDRESS,
    ViemLocalEip712Signer,
    idRegistryABI,
  } = await import('@farcaster/hub-nodejs');
  const { bytesToHex, createPublicClient, http, keccak256, toBytes } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { optimism } = await import('viem/chains');

  // Step 1: Reserve FID
  const fidRes = await fetch(`${NEYNAR_API_BASE}/user/fid`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      api_key: NEYNAR_API_KEY,
      'x-wallet-id': NEYNAR_WALLET_ID,
    },
  });

  if (!fidRes.ok) {
    const errText = await fidRes.text().catch(() => 'Unknown error');
    throw new Error(`Failed to reserve FID: ${fidRes.status} ${errText}`);
  }

  const fidData = (await fidRes.json()) as { fid: number };

  // Step 2: Derive custody wallet from DEPLOYER_PRIVATE_KEY + agentId
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const derivedKey = keccak256(toBytes(`${deployerKey}:${options.agentId}`));
  const account = privateKeyToAccount(derivedKey);
  const custodyAddress = account.address;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem version mismatch
  const eip712Signer = new ViemLocalEip712Signer(account as any);

  const publicClient = createPublicClient({
    chain: optimism,
    transport: http(),
  });

  const nonce = await publicClient.readContract({
    address: ID_REGISTRY_ADDRESS,
    abi: idRegistryABI,
    functionName: 'nonces',
    args: [custodyAddress],
  });

  const signatureResult = await eip712Signer.signTransfer({
    fid: BigInt(fidData.fid),
    to: custodyAddress,
    nonce: nonce as bigint,
    deadline,
  });

  if (signatureResult.isErr()) {
    throw new Error(`Failed to sign transfer: ${signatureResult.error}`);
  }

  const signature = bytesToHex(signatureResult.value);

  // Step 3: Register account
  const registerRes = await fetch(`${NEYNAR_API_BASE}/user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      api_key: NEYNAR_API_KEY,
      'x-wallet-id': NEYNAR_WALLET_ID,
    },
    body: JSON.stringify({
      signature,
      fid: fidData.fid,
      requested_user_custody_address: custodyAddress,
      deadline: Number(deadline),
      fname: options.username,
      metadata: {
        bio: options.bio,
        pfp_url: options.pfpUrl ?? '',
        display_name: options.displayName,
        url: '',
      },
    }),
  });

  if (!registerRes.ok) {
    const errText = await registerRes.text().catch(() => 'Unknown error');
    throw new Error(`Failed to register account: ${registerRes.status} ${errText}`);
  }

  const registerData = (await registerRes.json()) as {
    success: boolean;
    signer: { signer_uuid: string; fid: number };
  };

  return {
    fid: fidData.fid,
    signerUuid: registerData.signer?.signer_uuid ?? '',
    username: options.username,
    custodyAddress,
  };
}

// ── ERC-8004 Mint Provider ────────────────────────────────────────────────

/**
 * Mint an ERC-8004 identity token on-chain.
 *
 * Production: Calls ERC8004TrustRegistry.mintIdentity(walletAddress, agentUri)
 *             via viem, waits for receipt, parses IdentityMinted event for tokenId.
 * Demo Mode:  Generates a sequential mock tokenId (no gas spent).
 *
 * The deployer private key must be an authorized minter on the contract.
 */
async function mintErc8004Identity(
  walletAddress: string,
  agentUri: string,
): Promise<{ tokenId: number; txHash: string }> {
  // ── Demo Mode: mock token generation ────────────────────────────────────
  if (DEMO_MODE) {
    const existingCount = await prisma.eRC8004Identity.count();
    const tokenId = existingCount + 1;

    logger.info(
      { tokenId, walletAddress, note: 'Demo mode — no on-chain tx' },
      'ERC-8004 identity generated (demo)',
    );

    return {
      tokenId,
      txHash: `0x${'0'.repeat(64)}`,
    };
  }

  // ── Production: real on-chain mint ──────────────────────────────────────
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const rpcUrl = process.env.BASE_RPC_URL;
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '8453');

  if (!deployerKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY required for ERC-8004 minting');
  }
  if (!rpcUrl) {
    throw new Error('BASE_RPC_URL required for ERC-8004 minting');
  }

  const { createPublicClient, createWalletClient, http, decodeEventLog } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { base, baseSepolia } = await import('viem/chains');

  const chain = chainId === 8453 ? base : baseSepolia;
  const account = privateKeyToAccount(deployerKey as `0x${string}`);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const registryAddress = CONTRACT_ADDRESSES.erc8004Registry;

  // Simulate first to catch reverts without spending gas
  const { request } = await publicClient.simulateContract({
    account,
    address: registryAddress,
    abi: ERC8004_TRUST_REGISTRY_ABI,
    functionName: 'mintIdentity',
    args: [walletAddress as `0x${string}`, agentUri],
  });

  const txHash = await walletClient.writeContract(request);

  logger.info(
    { txHash, walletAddress, registryAddress },
    'ERC-8004 mintIdentity tx submitted',
  );

  // Wait for on-chain confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === 'reverted') {
    throw new Error(`ERC-8004 mintIdentity transaction reverted: ${txHash}`);
  }

  // Parse IdentityMinted event from receipt logs to extract tokenId
  let tokenId: number | null = null;

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ERC8004_TRUST_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === 'IdentityMinted') {
        const args = decoded.args as { agent: `0x${string}`; tokenId: bigint; agentURI: string };
        tokenId = Number(args.tokenId);
        break;
      }
    } catch {
      // Not our event — skip
    }
  }

  // Fallback: query the contract directly if event parsing fails
  if (tokenId === null) {
    const onChainTokenId = await publicClient.readContract({
      address: registryAddress,
      abi: ERC8004_TRUST_REGISTRY_ABI,
      functionName: 'getTokenByAgent',
      args: [walletAddress as `0x${string}`],
    });
    tokenId = Number(onChainTokenId);
  }

  logger.info(
    { tokenId, txHash, blockNumber: Number(receipt.blockNumber) },
    'ERC-8004 identity minted on-chain',
  );

  return { tokenId, txHash };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Execute the Trinity deployment for an agent.
 *
 * This is the public entry point called from the deploy route.
 * It constructs the dependency injection object and delegates
 * to the core deployer logic.
 */
export async function executeTrinityDeploy(
  input: TrinityDeployInput,
): Promise<TrinityDeployResult> {
  // Dynamically import the deployer to avoid circular dependencies
  // between web and agent-runtime packages
  const { deployTrinity } = await import('./trinity-deployer-core.js');

  const deps: TrinityDeps = {
    provisionWallet,
    createFarcasterAccount: createFarcasterAccountDep,
    mintErc8004Identity,
  };

  return deployTrinity(
    prisma,
    input,
    deps,
    DEMO_MODE,
    logger,
  );
}
