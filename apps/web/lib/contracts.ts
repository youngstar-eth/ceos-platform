import { type Address } from 'viem';

// Contract addresses from environment variables (trimmed to prevent whitespace issues)
export const CONTRACT_ADDRESSES = {
  // v1 Core
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
  scoutFund: (process.env.NEXT_PUBLIC_SCOUT_FUND_ADDRESS?.trim() ?? '0x') as Address,
  agentTreasuryImpl: (process.env.NEXT_PUBLIC_AGENT_TREASURY_IMPL_ADDRESS?.trim() ?? '0x') as Address,
} as const;

// ABIs generated from contracts/out/ (Foundry compiled output)
export const AGENT_FACTORY_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_implementation",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_agentRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_trustRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_revenuePool",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_treasury",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DEFAULT_DEPLOY_FEE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_AGENTS_PER_CREATOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAgentRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deployAgent",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "agentURI",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "getAgentCount",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAgentsByCreator",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDeployFee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "implementation",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revenuePool",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setDeployFee",
    "inputs": [
      {
        "name": "newFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTreasury",
    "inputs": [
      {
        "name": "newTreasury",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "trustRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC8004TrustRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AgentDeployed",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DeployFeeUpdated",
    "inputs": [
      {
        "name": "oldFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryUpdated",
    "inputs": [
      {
        "name": "oldTreasury",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "newTreasury",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "FailedDeployment",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientBalance",
    "inputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsufficientDeployFee",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MaxAgentsReached",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;

export const REVENUE_POOL_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_usdc",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_scoreSubmitter",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "BPS_DENOMINATOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CREATOR_SHARE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimRevenue",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "depositUSDC",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "epochDuration",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "genesisTimestamp",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getClaimable",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCurrentEpoch",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEpochRevenue",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "creatorShare",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "finalized",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "scoreSubmitter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setEpochDuration",
    "inputs": [
      {
        "name": "newDuration",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setScoreSubmitter",
    "inputs": [
      {
        "name": "newSubmitter",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitEpochScores",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "creators",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "scores",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "EpochDurationUpdated",
    "inputs": [
      {
        "name": "oldDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EpochFinalized",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "totalRevenue",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "creatorShare",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RevenueClaimed",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RevenueDeposited",
    "inputs": [
      {
        "name": "depositor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "isUSDC",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyClaimed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ArrayLengthMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochNotFinalized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidEpoch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  }
] as const;

export const CREATOR_SCORE_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_oracle",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ENGAGEMENT_WEIGHT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GROWTH_WEIGHT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SCORE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "QUALITY_WEIGHT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UPTIME_WEIGHT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "WEIGHT_DENOMINATOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getScore",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ICreatorScore.ScoreBreakdown",
        "components": [
          {
            "name": "engagement",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "growth",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quality",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "uptime",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalScore",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTotalScore",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "oracle",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setOracle",
    "inputs": [
      {
        "name": "newOracle",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitScores",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "creators",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "engagement",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "growth",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "quality",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "uptime",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "OracleUpdated",
    "inputs": [
      {
        "name": "oldOracle",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "newOracle",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ScoresSubmitted",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "creatorCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ArrayLengthMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidScoreValue",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ScoresAlreadySubmitted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedOracle",
    "inputs": []
  }
] as const;

// ── StakingRewards ABI (MasterChef-style + Patron Multiplier) ──

export const STAKING_REWARDS_ABI = [
  {
    type: 'function',
    name: 'stake',
    inputs: [{ name: 'pid', type: 'uint256' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'pid', type: 'uint256' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'harvest',
    inputs: [{ name: 'pid', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'pendingRewards',
    inputs: [{ name: 'pid', type: 'uint256' }, { name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserInfo',
    inputs: [{ name: 'pid', type: 'uint256' }, { name: 'user', type: 'address' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'amount', type: 'uint256' },
        { name: 'rewardDebt', type: 'uint256' },
        { name: 'lastDepositTime', type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPoolInfo',
    inputs: [{ name: 'pid', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'stakingToken', type: 'address' },
        { name: 'agentToken', type: 'address' },
        { name: 'agentTokenThreshold', type: 'uint256' },
        { name: 'totalStaked', type: 'uint256' },
        { name: 'allocPoint', type: 'uint256' },
        { name: 'lastRewardTime', type: 'uint256' },
        { name: 'accRunPerShare', type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserBoostStatus',
    inputs: [{ name: 'pid', type: 'uint256' }, { name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'runPerSecond',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalAllocPoint',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'poolCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'PATRON_MULTIPLIER',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ── AgentTreasury ABI (Per-agent DEX trading + buyback) ──

export const AGENT_TREASURY_ABI = [
  {
    type: 'function',
    name: 'getETHBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTrackedBalances',
    inputs: [],
    outputs: [{
      name: 'balances',
      type: 'tuple[]',
      components: [
        { name: 'token', type: 'address' },
        { name: 'balance', type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTotalBurns',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTotalBurnedAmount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ── ScoutFund ABI (Protocol-owned venture capital) ──

export const SCOUT_FUND_ABI = [
  {
    type: 'function',
    name: 'getETHBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPositionCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPosition',
    inputs: [{ name: 'agentToken', type: 'address' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'token', type: 'address' },
        { name: 'totalInvested', type: 'uint256' },
        { name: 'totalTokensAcquired', type: 'uint256' },
        { name: 'totalDivested', type: 'uint256' },
        { name: 'investmentCount', type: 'uint256' },
        { name: 'firstInvestedAt', type: 'uint256' },
        { name: 'lastInvestedAt', type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isScoutable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// ── FeeSplitter ABI (Protocol fee distribution: 40/40/20 split) ──

export const FEE_SPLITTER_ABI = [
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
  {
    type: 'function',
    name: 'getDistribution',
    inputs: [{ name: 'distributionId', type: 'uint256' }],
    outputs: [{
      name: 'record',
      type: 'tuple',
      components: [
        { name: 'distributor', type: 'address' },
        { name: 'agentTreasury', type: 'address' },
        { name: 'totalETH', type: 'uint256' },
        { name: 'totalUSDC', type: 'uint256' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
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
    name: 'protocolTreasury',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'scoutFund',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

// ── ERC20 minimal ABI (for approve/allowance on staking tokens) ──

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

export function getScoutFundContract() {
  return {
    address: CONTRACT_ADDRESSES.scoutFund,
    abi: SCOUT_FUND_ABI,
  } as const;
}

export function getFeeSplitterContract() {
  return {
    address: CONTRACT_ADDRESSES.feeSplitter,
    abi: FEE_SPLITTER_ABI,
  } as const;
}

