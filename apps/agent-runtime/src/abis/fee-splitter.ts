export const FEE_SPLITTER_ABI = [
  {
    type: 'function',
    name: 'distributeFees',
    inputs: [{ name: 'agentTreasury', type: 'address' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'distributeUSDCFees',
    inputs: [
      { name: 'agentTreasury', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimETH',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimUSDC',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getClaimable',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [
      { name: 'ethAmount', type: 'uint256' },
      { name: 'usdcAmount', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDistributionCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
