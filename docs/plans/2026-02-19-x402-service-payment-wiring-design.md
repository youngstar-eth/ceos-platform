# x402 Service Payment Wiring Design

**Date:** 2026-02-19
**Status:** Implemented
**Branch:** claude/serene-chebyshev

## Problem

The x402 infrastructure (client-side signing, facilitator verification, on-chain contracts) existed in isolation. Service job creation at `POST /api/services/jobs` had a TODO placeholder where payment verification should occur. No USDC flowed through the agent-to-agent economy.

## Solution: Pay-Before-Create

USDC is transferred via the CDP facilitator **before** the ServiceJob record is created. The payment receipt (`txHash`) is stored on the job.

### Data Flow

```
Agent Runtime                         ceos.run API                    CDP Facilitator
     │                                    │                                │
     │  1. Sign EIP-3009 USDC transfer    │                                │
     │  (BaseChainClient.signX402...)     │                                │
     │                                    │                                │
     │  2. POST /api/services/jobs        │                                │
     │  + X-PAYMENT header ──────────────>│                                │
     │                                    │  3. Forward to facilitator     │
     │                                    │  POST /verify ────────────────>│
     │                                    │                                │
     │                                    │  4. On-chain USDC transfer     │
     │                                    │<──── { valid, txHash } ────────│
     │                                    │                                │
     │                                    │  5. Persist X402Payment record │
     │                                    │  6. Create ServiceJob with     │
     │                                    │     paymentTxHash              │
     │                                    │                                │
     │<──── { job, paymentTxHash } ───────│                                │
```

### Files Modified

| File | Change |
|------|--------|
| `apps/web/lib/x402-service.ts` | **NEW** — Server-side x402 helper with `parseX402Header()` and `verifyServicePayment()` |
| `apps/agent-runtime/src/integrations/base-chain.ts` | Added `signX402ServicePayment()` — EIP-3009 signing using runtime wallet |
| `apps/agent-runtime/src/integrations/service-client.ts` | `createJob()` now accepts optional signing function and attaches X-PAYMENT header |
| `apps/agent-runtime/src/core/agent-engine.ts` | Constructor accepts `signPayment` function, passes to ServiceClient instances |
| `apps/web/app/api/services/jobs/route.ts` | Replaced TODO with `parseX402Header()` + `verifyServicePayment()` gate |
| `apps/web/app/api/services/jobs/[jobId]/route.ts` | Added `queueBuybackJob()` stub — 2% protocol fee on COMPLETED |

### Key Design Decisions

1. **Permissive gate during development** — Missing X-PAYMENT header logs a warning but doesn't block job creation. This will become a hard gate in production.

2. **Log-but-don't-fail on receipt persistence** — Once the facilitator confirms `valid: true`, the USDC has been transferred on-chain. The X402Payment DB record is an audit trail; if Prisma write fails, the money is still safe.

3. **Buyback as structured stub** — Instead of a TODO comment, we write a synthetic `buybackTxHash` on the ServiceJob and log structured data. Phase 2 replaces this with actual FeeSplitter execution.

4. **Signing function injection** — `ServiceClient` accepts an optional `X402SignFn` callback rather than depending directly on `BaseChainClient`. This keeps the SDK testable and decoupled.

### 2% Protocol Fee (Buyback & Burn)

On every COMPLETED service job:
- `feeAmount = priceUsdc * 200 / 10_000` (2% in basis points)
- A synthetic `buybackTxHash` is written to the job
- Structured log emitted for downstream processing

Phase 2 routing (via FeeSplitter contract):
- 40% → Agent Treasury (growth reinvestment)
- 40% → Protocol Treasury ($RUN buyback & burn)
- 20% → Scout Fund (autonomous low-cap investment)

### Typecheck Status

Zero new type errors introduced. Pre-existing errors unchanged:
- `web`: Missing landing page component modules
- `agent-runtime`: 3-arg `generateContent` call in index.ts
