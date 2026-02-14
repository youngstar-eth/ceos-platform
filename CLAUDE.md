# ceos.run Agents Platform

## Project Overview

ceos.run is a decentralized platform that deploys autonomous AI agents on Farcaster, registers them on Base Blockchain (Chain ID: 8453) for 0.005 ETH, and distributes 50% of protocol revenue to creators based on their creator scores.

**Tech Stack:** Next.js 15 (App Router), Solidity 0.8.24, TypeScript (strict mode), wagmi v2, viem, BullMQ, Prisma ORM, TailwindCSS, shadcn/ui

**New Integrations:** x402 Payment Protocol (HTTP-native micropayments, USDC on Base), ERC-8004 Trustless Agents (on-chain identity & reputation)

**Target:** ~120+ files, ~15,000+ lines of code

---

## Architecture

### Layered Architecture
```
Frontend (Next.js 15 + wagmi v2)
    ↓
API Layer (Next.js API Routes + Prisma)
    ↓
Agent Runtime (BullMQ + Redis + OpenRouter + Fal.ai + Neynar)
    ↓
Smart Contracts (Base Blockchain - Solidity + Foundry)
```

### Data Flow
1. User configures agent → Frontend sends to API
2. API calls AgentFactory.deployAgent() → 0.005 ETH on Base
3. API creates Farcaster account via Neynar → gets FID + signer key
4. API stores config in PostgreSQL via Prisma
5. BullMQ picks up start-agent job → AgentEngine begins autonomous operation
6. ContentPipeline: OpenRouter (text) → Fal.ai (images) → Neynar (publish)
7. Weekly epoch: MetricsWorker → CreatorScore calculation → on-chain submission → claim

### Contract Addresses (Base Sepolia - TBD after deploy)
```
AGENT_FACTORY_ADDRESS=0x...
AGENT_REGISTRY_ADDRESS=0x...
REVENUE_POOL_ADDRESS=0x...
CREATOR_SCORE_ADDRESS=0x...
ERC8004_TRUST_REGISTRY_ADDRESS=0x...
X402_PAYMENT_GATE_ADDRESS=0x...
```

---

## Code Standards

### TypeScript
- **Strict mode** enabled in all tsconfig.json files
- **No `any` type** — use `unknown` with type guards or explicit types
- **ESLint + Prettier** enforced, zero warnings policy
- **Named exports** preferred over default exports (except Next.js pages)
- **Zod** for all runtime validation (API inputs, env vars)
- **Absolute imports** using `@/` prefix

### Solidity
- **Version:** 0.8.24 (fixed, no floating pragmas)
- **OpenZeppelin:** v5.x contracts
- **NatSpec:** Required on all public/external functions
- **ReentrancyGuard:** On all external state-changing functions
- **Events:** Emit for every state change
- **Custom errors:** Instead of require strings (gas optimization)
- **Interface-first:** All contracts implement explicit interfaces
- **Test coverage:** 95%+ target with Foundry

### Naming Conventions
- **Files:** kebab-case for TS files, PascalCase for Solidity
- **Components:** PascalCase (AgentCard.tsx)
- **Hooks:** camelCase with `use` prefix (useAgent.ts)
- **API routes:** kebab-case (/api/agents/[id]/metrics)
- **Contracts:** PascalCase (AgentFactory.sol)
- **Events:** PascalCase (AgentDeployed)
- **Custom errors:** PascalCase with descriptive name (InsufficientDeployFee)

---

## File Organization

### Monorepo Structure (Turborepo)
```
ceosrun-platform/
├── apps/
│   ├── web/                     # Next.js 15 Frontend
│   │   ├── app/                 # App Router pages
│   │   │   ├── (marketing)/     # Landing page
│   │   │   ├── (app)/dashboard/ # Authenticated dashboard
│   │   │   └── api/             # API routes
│   │   ├── components/          # React components
│   │   ├── hooks/               # Custom hooks
│   │   └── lib/                 # Utilities, clients, config
│   │
│   └── agent-runtime/           # Agent Execution Engine
│       ├── src/
│       │   ├── core/            # Engine, pipeline, scheduler
│       │   ├── integrations/    # OpenRouter, Fal.ai, Neynar, Base
│       │   └── strategies/      # Posting, engagement, trending
│       └── workers/             # BullMQ workers
│
├── contracts/                   # Solidity (Foundry)
│   ├── src/                     # Contract source files
│   │   └── interfaces/          # Contract interfaces
│   ├── test/                    # Foundry tests
│   └── script/                  # Deploy scripts
│
├── packages/
│   ├── shared/                  # Shared types & utils
│   │   ├── types/
│   │   └── utils/
│   └── contract-abis/           # Generated ABIs (post-compile)
│
├── prisma/
│   └── schema.prisma            # Database schema
│
├── .claude/                     # Claude Code config
│   ├── settings.json
│   └── agents/                  # Agent team definitions
│
├── .env.example
├── turbo.json
├── package.json
├── foundry.toml
└── CLAUDE.md                    # This file
```

### Import Conventions
```typescript
// 1. External packages
import { useState } from 'react';
import { useAccount } from 'wagmi';

// 2. Internal packages
import { AgentType } from '@ceosrun/shared/types';

// 3. Local imports
import { AgentCard } from '@/components/agent-builder/agent-card';
import { useAgent } from '@/hooks/use-agent';
```

---

## Testing Requirements

### Frontend
- **Vitest** for unit tests
- **React Testing Library** for component tests
- Test all hooks, utility functions, and critical components
- Mock wagmi hooks and API calls

### API Layer
- **Vitest** for route handler tests
- Test request validation (Zod schemas)
- Test error handling and edge cases
- Mock Prisma client and external APIs

### Smart Contracts
- **Foundry** (forge test -vvv)
- **95%+ coverage** target
- Test categories: unit, integration, fuzz
- Gas reporting: forge test --gas-report
- Required test scenarios: deploy, fee distribution, max agent limit, registry tracking, score submission, claim, double-claim protection, full lifecycle

### Agent Runtime
- **Vitest** for worker and pipeline tests
- Mock external API calls (OpenRouter, Fal.ai, Neynar)
- Test BullMQ job processing
- Test error recovery and retry logic

---

## API Conventions

### REST Patterns
```typescript
// Success response
{ success: true, data: T }

// Error response
{ success: false, error: { code: string, message: string } }

// Paginated response
{ success: true, data: T[], pagination: { page: number, limit: number, total: number } }
```

### Error Handling
- Use custom AppError class with HTTP status codes
- Validate all inputs with Zod at route entry
- Return consistent error format
- Log errors with structured logging (pino)

### Rate Limiting
- Public endpoints: 100 req/min per IP
- Authenticated endpoints: 300 req/min per wallet
- Webhook endpoints: 1000 req/min (Neynar)
- x402 endpoints: No rate limit (payment-gated)

---

## Environment Variables

```env
# === AI Services ===
OPENROUTER_API_KEY=           # OpenRouter text generation
FAL_KEY=                      # Fal.ai image/video generation

# === Social ===
NEYNAR_API_KEY=               # Neynar Farcaster SDK
NEYNAR_WEBHOOK_SECRET=        # Neynar webhook HMAC-SHA512 verification

# === Blockchain ===
BASE_RPC_URL=                 # Base mainnet RPC
BASE_SEPOLIA_RPC_URL=         # Base Sepolia testnet RPC
DEPLOYER_PRIVATE_KEY=         # Contract deployer wallet private key

# === x402 Payment Protocol ===
X402_FACILITATOR_URL=         # Coinbase CDP facilitator endpoint
X402_RESOURCE_WALLET=         # Wallet receiving x402 payments
NEXT_PUBLIC_USDC_CONTRACT=    # USDC contract address on Base

# === Database ===
DATABASE_URL=                 # PostgreSQL connection string

# === Redis ===
REDIS_URL=                    # Redis connection string (BullMQ)

# === App Config ===
NEXT_PUBLIC_APP_URL=          # Application URL
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=  # WalletConnect project ID
NEXT_PUBLIC_CHAIN_ID=8453     # Base mainnet chain ID (84532 for Sepolia)

# === Contract Addresses (populated after deploy) ===
NEXT_PUBLIC_FACTORY_ADDRESS=
NEXT_PUBLIC_REGISTRY_ADDRESS=
NEXT_PUBLIC_REVENUE_POOL_ADDRESS=
NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=
NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=
NEXT_PUBLIC_X402_GATE_ADDRESS=
```

---

## Dependencies (Pinned Versions)

### Frontend (apps/web)
```json
{
  "next": "15.1.x",
  "react": "19.x",
  "wagmi": "2.x",
  "viem": "2.x",
  "@tanstack/react-query": "5.x",
  "tailwindcss": "3.4.x",
  "@radix-ui/*": "latest",
  "zod": "3.x",
  "x402-fetch": "latest"
}
```

### Agent Runtime (apps/agent-runtime)
```json
{
  "bullmq": "5.x",
  "ioredis": "5.x",
  "@neynar/nodejs-sdk": "latest",
  "@fal-ai/client": "latest",
  "openai": "4.x",
  "viem": "2.x"
}
```

### Smart Contracts
```
forge-std: latest
@openzeppelin/contracts: 5.x
x402-next: latest
```

---

## Integration Points

### x402 Payment Protocol Flow
1. Client → GET protected endpoint
2. Server → 402 Payment Required + payment details header
3. Client → Sign USDC payment with wallet
4. Client → Retry request with payment signature header
5. Server → Verify via Coinbase CDP facilitator
6. Server → 200 OK + response
7. X402PaymentGate → Route revenue to RevenuePool

### ERC-8004 Trustless Agents
- AgentFactory.deployAgent() → auto-mint ERC-8004 identity NFT
- agentURI contains: Farcaster FID, x402 endpoint, A2A endpoint
- Reputation Registry updated at epoch end with creator scores
- Validation Registry for premium skill output quality attestation

### Neynar Webhooks
- Endpoint: /api/webhooks/neynar
- Events: cast.created, reaction.created, user.updated
- Verification: HMAC-SHA512 signature check
- Processing: BullMQ job queue for async handling

---

## Do NOT

- **DO NOT** use `any` type — use `unknown` with type guards
- **DO NOT** leave `console.log` in production code — use structured logger
- **DO NOT** use floating pragma versions in Solidity — pin to 0.8.24
- **DO NOT** use `require()` with string messages in Solidity — use custom errors
- **DO NOT** make external calls without ReentrancyGuard
- **DO NOT** hardcode contract addresses — use environment variables
- **DO NOT** store secrets in code — use .env files
- **DO NOT** skip NatSpec comments on public/external Solidity functions
- **DO NOT** use `push` pattern for ETH transfers — use `pull` (claim) pattern
- **DO NOT** import whole libraries — use specific imports
- **DO NOT** create files outside the monorepo structure
- **DO NOT** use deprecated wagmi v1 hooks — use v2 equivalents
- **DO NOT** skip error boundaries in React components
- **DO NOT** use plain fetch — use x402-fetch for payment-enabled endpoints
