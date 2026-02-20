/**
 * Trinity Deployer Types — Shared type definitions
 *
 * These types are shared between the Trinity Deployer core logic
 * and the web-side adapter. They define the interfaces for
 * dependency injection and result reporting.
 */

import type { TrinityStatus } from '@prisma/client';

/** Result of a single CDP wallet provisioning step */
export interface CdpResult {
  walletId: string;
  walletAddress: string;
  walletEmail: string;
  network: string;
}

/** Result of a single Farcaster account creation step */
export interface FarcasterResult {
  fid: number;
  signerUuid: string;
  username: string;
  custodyAddress: string;
}

/** Result of a single ERC-8004 identity minting step */
export interface Erc8004Result {
  tokenId: number;
  agentUri: string;
  mintTxHash: string | null;
}

/** Full result of the Trinity deploy pipeline */
export interface TrinityDeployResult {
  trinityStatus: TrinityStatus;
  cdp: CdpResult | null;
  farcaster: FarcasterResult | null;
  erc8004: Erc8004Result | null;
  errors: string[];
}

/** Input for deploying an agent's Trinity identity */
export interface TrinityDeployInput {
  agentId: string;
  agentName: string;
  description: string | null;
  persona: Record<string, unknown>;
  skills: string[];
  creatorAddress: string;
}

/** Callbacks for external service integrations (dependency injection) */
export interface TrinityDeps {
  provisionWallet: (agentId: string, agentName: string) => Promise<CdpResult>;
  createFarcasterAccount: (options: {
    walletId: string;
    username: string;
    displayName: string;
    bio: string;
    pfpUrl?: string;
    agentId: string;
  }) => Promise<FarcasterResult>;
  mintErc8004Identity: (
    walletAddress: string,
    agentUri: string,
  ) => Promise<{ tokenId: number; txHash: string }>;
}
