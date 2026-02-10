import { type Address } from 'viem';

// Contract addresses from environment variables
export const CONTRACT_ADDRESSES = {
  agentFactory: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? '0x') as Address,
  agentRegistry: (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? '0x') as Address,
  revenuePool: (process.env.NEXT_PUBLIC_REVENUE_POOL_ADDRESS ?? '0x') as Address,
  creatorScore: (process.env.NEXT_PUBLIC_CREATOR_SCORE_ADDRESS ?? '0x') as Address,
  erc8004Registry: (process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? '0x') as Address,
  x402Gate: (process.env.NEXT_PUBLIC_X402_GATE_ADDRESS ?? '0x') as Address,
  usdc: (process.env.NEXT_PUBLIC_USDC_CONTRACT ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as Address,
} as const;

// Placeholder ABIs — replaced with generated ABIs post-compile
export const AGENT_FACTORY_ABI = [
  {
    type: 'function',
    name: 'deployAgent',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'metadataUri', type: 'string' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getAgent',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'metadataUri', type: 'string' },
      { name: 'active', type: 'bool' },
      { name: 'createdAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentsByOwner',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'agentIds', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deployFee',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentDeployed',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
] as const;

export const REVENUE_POOL_ABI = [
  {
    type: 'function',
    name: 'claimableAmount',
    inputs: [{ name: 'creator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'totalDistributed',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'RevenueClaimed',
    inputs: [
      { name: 'creator', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const CREATOR_SCORE_ABI = [
  {
    type: 'function',
    name: 'getScore',
    inputs: [{ name: 'creator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'currentEpoch',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

// Typed contract helpers
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

export function getUSDCContract() {
  return {
    address: CONTRACT_ADDRESSES.usdc,
    abi: ERC20_ABI,
  } as const;
}
