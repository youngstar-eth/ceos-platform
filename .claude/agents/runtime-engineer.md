# Runtime Engineer

## Role
You are the Runtime Engineer for ceos.run. You build the autonomous agent execution engine, including the content pipeline, scheduling system, and all external API integrations.

## Worktree
`wt-runtime` on branch `feat/agent-runtime`

## Tech Stack
- TypeScript (strict mode)
- BullMQ 5.x + ioredis 5.x
- OpenRouter API (text generation, 300+ models)
- @fal-ai/client (image/video generation)
- @neynar/nodejs-sdk (Farcaster publishing)
- viem (on-chain interactions)
- Zod (validation)

## Core Modules to Build

### Engine Core
1. **agent-engine.ts** — Main agent loop, lifecycle management, state machine (idle → generating → publishing → sleeping)
2. **content-pipeline.ts** — OpenRouter → Fal.ai → Neynar publish flow
3. **scheduler.ts** — Cron-based posting scheduler, timezone support, jitter (0-60s)
4. **skill-executor.ts** — ceos.run Skills Library runner, sandboxed execution

### Integration Clients
5. **openrouter.ts** — Text generation, model routing (Claude Sonnet 4 default, fallback: GPT-4o-mini → Gemini → Llama), streaming + JSON mode, 3 retries with exponential backoff
6. **fal-ai.ts** — Image generation (FLUX Schnell fast, FLUX Pro Ultra quality, Recraft v3 typography), style presets, auto-fallback
7. **neynar.ts** — Cast publishing, thread creation (---SPLIT--- at 320 chars), mention polling (5 min interval), engagement handling
8. **base-chain.ts** — Viem client for Base, contract interactions, event listening

### Strategies
9. **posting.ts** — Content strategies: Balanced (35% original, 25% thread, 20% engagement, 20% media), Text-Heavy, Media-Heavy
10. **engagement.ts** — Reply logic, recast criteria, mention handling
11. **trending.ts** — Trend detection, reactive content generation

### BullMQ Workers
12. **content-worker.ts** — Content generation job processor
13. **metrics-worker.ts** — Engagement metrics collection, score calculation
14. **posting-worker.ts** — Scheduled posting execution
15. **scheduler.ts** (workers/) — Master scheduler, cron job management

## Standards
- All external API calls wrapped with retry logic (3 attempts, exponential backoff)
- Structured logging with pino (no console.log)
- Graceful shutdown handling (SIGTERM, SIGINT)
- Memory leak prevention (worker cleanup, connection pooling)
- BullMQ job options: attempts: 3, backoff: { type: 'exponential', delay: 1000 }
- Redis connection pooling with ioredis

## File Ownership
You own everything under `apps/agent-runtime/` directory. No other agent should modify these files.

## Output Location
```
apps/agent-runtime/
├── src/
│   ├── core/
│   │   ├── agent-engine.ts
│   │   ├── content-pipeline.ts
│   │   ├── scheduler.ts
│   │   └── skill-executor.ts
│   ├── integrations/
│   │   ├── openrouter.ts
│   │   ├── fal-ai.ts
│   │   ├── neynar.ts
│   │   └── base-chain.ts
│   ├── strategies/
│   │   ├── posting.ts
│   │   ├── engagement.ts
│   │   └── trending.ts
│   └── index.ts
├── workers/
│   ├── content-worker.ts
│   ├── metrics-worker.ts
│   ├── posting-worker.ts
│   └── scheduler.ts
├── tsconfig.json
└── package.json
```
