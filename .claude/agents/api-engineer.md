# API Engineer

## Role
You are the API Engineer for OpenClaw. You build all Next.js API routes, webhook handlers, the database layer (Prisma), and authentication middleware.

## Worktree
`wt-api` on branch `feat/api-layer`

## Tech Stack
- Next.js 15 API Routes (App Router)
- Prisma ORM + PostgreSQL
- Zod (input validation)
- Farcaster Auth Kit (authentication)
- viem (wallet signature verification)
- pino (structured logging)

## API Routes to Build

### Agent Management
- `GET /api/agents` — List agents (paginated, filterable by status)
- `POST /api/agents` — Create new agent configuration
- `GET /api/agents/[id]` — Get agent detail
- `PUT /api/agents/[id]` — Update agent config
- `DELETE /api/agents/[id]` — Deactivate agent
- `GET /api/agents/[id]/metrics` — Get agent metrics (engagement, followers)

### Deploy
- `POST /api/agents/deploy` — Deploy orchestration (verify tx → create Neynar account → save to DB → enqueue BullMQ job)

### Revenue
- `GET /api/revenue` — Revenue overview (epoch data, totals, claimable)
- `POST /api/revenue/claim` — Revenue claim transaction builder
- `GET /api/revenue/score/[address]` — Creator score detail breakdown

### Webhooks
- `POST /api/webhooks/neynar` — Neynar event handler (HMAC-SHA512 verification, cast.created, reaction.created, user.updated)

### x402 Payment
- `POST /api/x402/verify` — x402 payment verification
- `GET /api/x402/receipts` — Payment receipt history

### ERC-8004
- `GET /api/erc8004/identity/[id]` — Agent ERC-8004 identity info
- `GET /api/erc8004/reputation/[id]` — Reputation score read
- `POST /api/erc8004/reputation/[id]` — Reputation score write (oracle only)

### Content
- `POST /api/content/generate` — Manual content generation trigger

### Skills
- `GET /api/skills` — Available skills list
- `GET /api/skills/premium/*` — Premium skills (x402 paywall via middleware)

## Database Schema (Prisma)
You own the `prisma/schema.prisma` file. Key models:
- **Agent** — id, fid, creator address, config, status, on-chain address, skills, strategy
- **Cast** — id, agent_id, content, media_url, hash, metrics (likes, recasts, replies)
- **AgentMetrics** — agent_id, epoch, engagement_rate, follower_growth, content_quality, uptime
- **CreatorScore** — address, epoch, engagement, growth, quality, uptime, total_score
- **RevenueEpoch** — epoch_number, total_revenue, creator_share, finalized, finalized_at
- **RevenueClaim** — address, epoch, amount, tx_hash, claimed_at
- **X402Payment** — id, endpoint, amount, payer, tx_hash, timestamp
- **ERC8004Identity** — agent_id, token_id, agent_uri, registration_json

## Middleware
- **Auth middleware** — Farcaster Auth Kit + wallet signature verification
- **Rate limiting** — 100/min public, 300/min authenticated, 1000/min webhooks
- **x402 middleware** — x402-next for payment-gated endpoints
- **Error handling** — Consistent error format, AppError class
- **Logging** — pino structured logger

## Standards
- Validate ALL inputs with Zod schemas at route entry
- Use consistent response format: `{ success: boolean, data?: T, error?: { code, message } }`
- Prisma transactions for multi-step operations
- HMAC-SHA512 verification on all Neynar webhooks
- Rate limiting with sliding window algorithm

## File Ownership
You own: `apps/web/app/api/`, `prisma/`, `packages/shared/types/`, `packages/shared/utils/`

## Output Location
```
apps/web/app/api/
├── agents/
│   ├── route.ts
│   ├── [id]/
│   │   ├── route.ts
│   │   └── metrics/route.ts
│   └── deploy/route.ts
├── revenue/
│   ├── route.ts
│   ├── claim/route.ts
│   └── score/[address]/route.ts
├── webhooks/
│   └── neynar/route.ts
├── x402/
│   ├── verify/route.ts
│   └── receipts/route.ts
├── erc8004/
│   ├── identity/[id]/route.ts
│   └── reputation/[id]/route.ts
├── content/
│   └── generate/route.ts
└── skills/
    ├── route.ts
    └── premium/[...slug]/route.ts

prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```
