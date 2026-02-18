import { type Address } from 'viem';

// ── Compiled ABIs from Foundry artifacts (contracts/out/) ────────────
// Import .abi from JSON to get full type-safe ABIs including events & errors.
// After any contract change: forge build && cp contracts/out/<Name>.sol/<Name>.json apps/web/lib/abis/
import AgentFactoryArtifact from '@/lib/abis/AgentFactory.json';
import AgentRegistryArtifact from '@/lib/abis/AgentRegistry.json';
import FeeSplitterArtifact from '@/lib/abis/FeeSplitter.json';
import RunTokenArtifact from '@/lib/abis/RunToken.json';
import StakingRewardsArtifact from '@/lib/abis/StakingRewards.json';
import CreatorScoreArtifact from '@/lib/abis/CreatorScore.json';
import RevenuePoolArtifact from '@/lib/abis/RevenuePool.json';
import AgentTreasuryArtifact from '@/lib/abis/AgentTreasury.json';

// ── Contract Addresses (from env vars, populated by deploy script) ───
export const CONTRACT_ADDRESSES = {
  // Core
  agentFactory: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS?.trim() ?? '0x') as Address,
  agentRegistry: (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS?.trim() ?? '0x') as Address,
  revenuePool: (process.env.NEXT_PUBLIC_REVENUE_POOL_ADDRESS?.trim() ?? '0x') as Address,
  creatorScore: (process.env.NEXT_PUBLIC_CREATOR_SCORE_ADDRESS?.trim() ?? '0x') as Address,
  ceosScore: (process.env.NEXT_PUBLIC_CEOS_SCORE_ADDRESS?.trim() ?? '0x') as Address,
  erc8004Registry: (process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS?.trim() ?? '0x') as Address,
  x402Gate: (process.env.NEXT_PUBLIC_X402_GATE_ADDRESS?.trim() ?? '0x') as Address,
  usdc: (process.env.NEXT_PUBLIC_USDC_CONTRACT?.trim() ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address,
  // v2 Financial Engine
  runToken: (process.env.NEXT_PUBLIC_RUN_TOKEN_ADDRESS?.trim() ?? '0x') as Address,
  stakingRewards: (process.env.NEXT_PUBLIC_STAKING_REWARDS_ADDRESS?.trim() ?? '0x') as Address,
  feeSplitter: (process.env.NEXT_PUBLIC_FEE_SPLITTER_ADDRESS?.trim() ?? '0x') as Address,
} as const;

// ── Exported ABIs ────────────────────────────────────────────────────
export const AGENT_FACTORY_ABI = AgentFactoryArtifact.abi as typeof AgentFactoryArtifact.abi;
export const AGENT_REGISTRY_ABI = AgentRegistryArtifact.abi as typeof AgentRegistryArtifact.abi;
export const FEE_SPLITTER_ABI = FeeSplitterArtifact.abi as typeof FeeSplitterArtifact.abi;
export const RUN_TOKEN_ABI = RunTokenArtifact.abi as typeof RunTokenArtifact.abi;
export const STAKING_REWARDS_ABI = StakingRewardsArtifact.abi as typeof StakingRewardsArtifact.abi;
export const CREATOR_SCORE_ABI = CreatorScoreArtifact.abi as typeof CreatorScoreArtifact.abi;
export const REVENUE_POOL_ABI = RevenuePoolArtifact.abi as typeof RevenuePoolArtifact.abi;
export const AGENT_TREASURY_ABI = AgentTreasuryArtifact.abi as typeof AgentTreasuryArtifact.abi;

// ── Minimal ERC20 ABI (for approve/allowance on staking tokens) ──────
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

// ── Typed Contract Helpers ───────────────────────────────────────────
// These return { address, abi } objects ready for wagmi's useReadContract / useWriteContract.

export function getAgentFactoryContract() {
  return {
    address: CONTRACT_ADDRESSES.agentFactory,
    abi: AGENT_FACTORY_ABI,
  } as const;
}

export function getRevenuePoolContract() {
  return {
    address: CONTRACT_ADDRESSES.revenuePool,
    abi: REVENUE_POOL_ABI,
  } as const;
}

export function getCreatorScoreContract() {
  return {
    address: CONTRACT_ADDRESSES.creatorScore,
    abi: CREATOR_SCORE_ABI,
  } as const;
}

export function getStakingRewardsContract() {
  return {
    address: CONTRACT_ADDRESSES.stakingRewards,
    abi: STAKING_REWARDS_ABI,
  } as const;
}

export function getAgentTreasuryContract(address: Address) {
  return {
    address,
    abi: AGENT_TREASURY_ABI,
  } as const;
}

export function getFeeSplitterContract() {
  return {
    address: CONTRACT_ADDRESSES.feeSplitter,
    abi: FEE_SPLITTER_ABI,
  } as const;
}

export function getRunTokenContract() {
  return {
    address: CONTRACT_ADDRESSES.runToken,
    abi: RUN_TOKEN_ABI,
  } as const;
}

export function getAgentRegistryContract() {
  return {
    address: CONTRACT_ADDRESSES.agentRegistry,
    abi: AGENT_REGISTRY_ABI,
  } as const;
}
