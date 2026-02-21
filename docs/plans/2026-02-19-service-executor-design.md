# Service Job Executor Design

**Date:** 2026-02-19
**Status:** Implemented
**Branch:** claude/serene-chebyshev

## Problem

The agent-to-agent service marketplace had a complete buyer side (discover → purchase → pay via x402) but a **missing seller side**. Once a seller agent accepted a job, nothing happened — the job sat in `ACCEPTED` status until it expired. The seller's autonomous fulfillment loop did not exist.

## Solution: Autonomous Executor Worker

A BullMQ-powered worker polls for `ACCEPTED` jobs, routes them through the runtime's `SkillExecutor`, and settles via the existing PATCH API.

### Data Flow

```
BullMQ Scheduler (15s)        Service Executor Worker          ceos.run API
       │                              │                             │
       │  1. Poll trigger             │                             │
       │──────────────────────>       │                             │
       │                              │  2. Query ACCEPTED jobs    │
       │                              │  for local agents (Prisma) │
       │                              │                             │
       │                              │  3. PATCH → DELIVERING     │
       │                              │────────────────────────────>│
       │                              │                             │
       │                              │  4. Route to SkillExecutor │
       │                              │  (capability → skill)      │
       │                              │                             │
       │                        [Success]                          │
       │                              │  5a. PATCH → COMPLETED     │
       │                              │  + deliverables JSON       │
       │                              │────────────────────────────>│
       │                              │                   6. Buyback & Burn │
       │                              │                   triggered (2%)    │
       │                                                                    │
       │                        [Failure]                          │
       │                              │  5b. PATCH → DISPUTED      │
       │                              │  + error context JSON      │
       │                              │────────────────────────────>│
```

### Files Modified

| File | Change |
|------|--------|
| `apps/agent-runtime/workers/service-executor.ts` | **NEW** — BullMQ executor with capability routing, timeout handling, API-driven settlement |
| `apps/agent-runtime/src/index.ts` | Wired executor into bootstrap, shutdown, agent context refresh loop |
| `apps/web/app/api/services/jobs/[jobId]/route.ts` | Added `DELIVERING → DISPUTED` to VALID_TRANSITIONS for error handling |

### Key Design Decisions

1. **API-driven settlement (not direct DB writes)** — The executor calls `PATCH /api/services/jobs/[jobId]` to transition states. This ensures all business logic (state machine validation, offering stats update, buyback fee calculation) lives in one place. The agent authenticates with its own wallet, proving sovereignty.

2. **DISPUTED for failures (not FAILED)** — The `ServiceJobStatus` enum doesn't include `FAILED`. `DISPUTED` is the semantically correct terminal state when execution fails after acceptance — it signals to the buyer that resolution is needed (refund, retry, or re-negotiation).

3. **SkillExecutor routing** — Jobs route via `requirements.capability` to the registered skill system. The `resolveSkillId()` function tries: exact match → partial match → category mapping → default fallback. This makes the executor fully pluggable: register a new skill and the executor handles new job types automatically.

4. **Cached agent contexts** — The executor maintains a cached list of `AgentExecutionContext` (agentId + walletAddress + persona) refreshed every 60 seconds alongside the agent poll timer. This avoids hitting the database on every 15-second poll cycle.

5. **Global timeout** — Each job execution is capped at `min(offering.maxLatencyMs, 120_000ms)`. The `executeWithGlobalTimeout()` wrapper resolves with a failed result instead of throwing, ensuring graceful handling.

6. **Fallback error persistence** — If PATCH to DISPUTED fails (e.g., network error), the executor writes error context directly to the job's `deliverables` JSON via Prisma. This ensures error information is never silently lost.

### Capability Routing Table

| Capability | Skill ID | Type |
|-----------|----------|------|
| `content` | `content-generation` | Content Generation |
| `analysis` | `trend-analysis` | Analytics |
| `trading` | `trend-analysis` | Analytics |
| `engagement` | `engagement-analysis` | Engagement |
| `networking` | `engagement-analysis` | Engagement |
| (exact match) | (skill ID) | Direct |
| (no match) | First registered skill | Fallback |

### Sovereign Economy Loop (Now Complete)

```
Buyer Agent                    Marketplace                   Seller Agent
     │                             │                              │
     │  1. Discover service        │                              │
     │────────────────────>        │                              │
     │                             │                              │
     │  2. Sign x402 USDC         │                              │
     │  3. POST /jobs + X-PAYMENT │                              │
     │────────────────────>        │                              │
     │                             │  4. Job = CREATED           │
     │                             │  (seller accepts manually)  │
     │                             │                              │
     │                             │  5. Job = ACCEPTED          │
     │                             │                              │
     │                             │  6. Executor picks up       │
     │                             │──────────────────────────>  │
     │                             │                              │
     │                             │  7. SkillExecutor runs      │
     │                             │                              │
     │                             │  8. PATCH → COMPLETED       │
     │                             │<──────────────────────────  │
     │                             │                              │
     │                             │  9. 2% → $RUN Buyback       │
     │                             │                              │
     │<──── Job result ────────────│                              │
```

### Typecheck Status

Zero new type errors introduced. Pre-existing errors unchanged:
- `web`: Missing landing page component modules
- `agent-runtime`: 3-arg `generateContent` call in index.ts
