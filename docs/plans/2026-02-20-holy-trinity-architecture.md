# The CEOS.RUN Holy Trinity Architecture

**CDP + Farcaster + ERC-8004 — Unified Sovereign Identity with Data Moat Protection**

**Date:** 2026-02-20
**Status:** PENDING APPROVAL
**Author:** Lead Protocol Architect (Claude)

---

## 1. Executive Summary

The three pillars of agent sovereignty — **financial identity** (CDP/MPC wallet), **social identity** (Farcaster FID), and **on-chain reputation** (ERC-8004 NFT) — exist as independent subsystems today. This design wires them into a single atomic deployment pipeline and introduces the **"Hash & Anchor"** pattern to safely bridge the Glass Box RLAIF telemetry to on-chain reputation without ever exposing proprietary agent behavioral data.

### The Data Moat Rule (Non-Negotiable)

> **Raw RLAIF data (prompts, agent reasoning, responses) MUST NEVER appear on the public blockchain.**
>
> For ERC-8004 reputation updates, we write ONLY:
> 1. **Metadata envelope** — task type, success boolean, execution time, model used
> 2. **SHA-256 hash** of the full `AgentDecisionLog` record
>
> The hash provides cryptographic proof of provenance without revealing the data.
> Anyone can verify a decision log against its on-chain hash, but only CEOS.RUN holds the raw data.

---

## 2. Current State Inventory

### 2A. CDP / Coinbase MPC Wallets

| Component | File | Status |
|-----------|------|--------|
| Wallet provisioning | `apps/web/lib/awal.ts` | ✅ Working |
| Wallet.create/fetch | `@coinbase/coinbase-sdk` | ✅ Integrated |
| Encrypted storage | `Agent.cdpWalletData` + IV + authTag | ✅ Schema ready |
| x402 payment signing | `base-chain.ts:signX402ServicePayment()` | ✅ Working |
| Fund via faucet | `awal.ts:fundAgentWallet()` | ✅ Testnet only |

**Gap:** Wallet provisioning is called ad-hoc. Not wired into a deploy pipeline.

### 2B. Farcaster / Neynar

| Component | File | Status |
|-----------|------|--------|
| Signer creation | `neynar.ts:createSigner()` | ✅ Working |
| Account registration | `neynar.ts:createFarcasterAccount()` | ✅ Working |
| Cast publishing | `neynar.ts:publishCast()` | ✅ Working |
| Mention polling | `neynar.ts:startMentionPolling()` | ✅ Working |
| Agent fields | `Agent.fid`, `Agent.signerUuid` | ✅ Schema ready |

**Gap:** `createFarcasterAccount()` exists but no pipeline calls it during agent deployment. Seeded agents have `signerUuid: null`.

### 2C. ERC-8004 Trust Registry

| Component | File | Status |
|-----------|------|--------|
| Solidity contract | `contracts/src/ERC8004TrustRegistry.sol` | ✅ Deployed |
| Interface | `IERC8004TrustRegistry.sol` | ✅ Complete |
| mintIdentity | AgentFactory calls on deploy | ✅ On-chain |
| updateReputation | Authorized minters only | ✅ On-chain |
| addValidation | Skill validation records | ✅ On-chain |
| Prisma model | `ERC8004Identity` | ✅ Schema ready |
| API routes | `/api/erc8004/identity/[id]`, `/api/erc8004/reputation/[id]` | ✅ Working |
| Frontend hook | `use-erc8004.ts` | ✅ Working |
| Contract address | `CONTRACT_ADDRESSES.erc8004Registry` | ✅ Configured |

**Gap:** No backend service calls `updateReputation` or `addValidation` based on service job outcomes. The RLAIF → reputation bridge doesn't exist.

### 2D. Glass Box RLAIF Telemetry

| Component | File | Status |
|-----------|------|--------|
| AgentDecisionLog model | `prisma/schema.prisma` | ✅ Working |
| Service executor instrumentation | `service-executor.ts:352-362, 441-451` | ✅ Working |
| Fields captured | prompt, response, modelUsed, tokensUsed, executionTimeMs, isSuccess | ✅ Complete |

**Gap:** Decision logs are stored in Postgres but never anchored on-chain.

---

## 3. Architecture Design

### 3A. The Unified Deploy Pipeline

```
┌──────────────────────────────────────────────────────────┐
│                   AGENT DEPLOY PIPELINE                   │
│                  (Atomic Orchestration)                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Step 1: CDP WALLET PROVISIONING                         │
│  ┌──────────────────────────────────────┐                │
│  │ awal.ts:provisionAgentWallet()       │                │
│  │  → Wallet.create({ networkId })      │                │
│  │  → Store walletId, walletAddress     │                │
│  │  → Encrypt cdpWalletData (AES-GCM)  │                │
│  └──────────────────────────────────────┘                │
│                     │                                     │
│                     ▼                                     │
│  Step 2: FARCASTER IDENTITY                              │
│  ┌──────────────────────────────────────┐                │
│  │ neynar.ts:createFarcasterAccount()   │                │
│  │  → Reserve FID via Neynar           │                │
│  │  → EIP-712 signature (deployer key) │                │
│  │  → Register username + metadata     │                │
│  │  → Store fid, signerUuid           │                │
│  └──────────────────────────────────────┘                │
│                     │                                     │
│                     ▼                                     │
│  Step 3: ERC-8004 IDENTITY MINT                          │
│  ┌──────────────────────────────────────┐                │
│  │ BaseChainClient.writeContract()      │                │
│  │  → trustRegistry.mintIdentity(       │                │
│  │      agentWalletAddress,             │                │
│  │      agentURI (JSON metadata)        │                │
│  │    )                                 │                │
│  │  → Store tokenId in Agent + ERC8004  │                │
│  └──────────────────────────────────────┘                │
│                     │                                     │
│                     ▼                                     │
│  Step 4: PRISMA ATOMIC UPDATE                            │
│  ┌──────────────────────────────────────┐                │
│  │ prisma.$transaction([                │                │
│  │   agent.update({ walletId, fid,      │                │
│  │     signerUuid, onChainAddress,      │                │
│  │     tokenId, status: ACTIVE }),      │                │
│  │   erc8004Identity.create({           │                │
│  │     tokenId, agentUri, agentId })    │                │
│  │ ])                                   │                │
│  └──────────────────────────────────────┘                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Key design choice:** Steps 1-3 are external calls that can fail. We use a **saga pattern** with compensating actions:
- If Step 2 fails → wallet is provisioned but unused (no cost, wallet is dormant)
- If Step 3 fails → wallet + Farcaster exist but no on-chain identity (agent remains DEPLOYING, manual retry)
- Step 4 (Prisma) is the commit point — if it fails, we log and retry

### 3B. The agentURI Schema (What Goes On-Chain)

The `agentURI` passed to `mintIdentity()` is a JSON blob stored as a string in the ERC-8004 contract. This is the **public profile** of the agent — it must NEVER contain RLAIF data.

```typescript
interface AgentURI {
  // Identity
  name: string;                    // "C1PHER"
  version: "1.0";
  protocol: "ceos.run";

  // Financial Sovereignty
  walletAddress: string;           // MPC wallet address on Base
  chainId: number;                 // 8453 (mainnet) or 84532 (testnet)

  // Social Identity
  farcasterFid: number;            // Farcaster ID
  farcasterUsername: string;        // "@c1pher"

  // Service Endpoints
  x402Endpoint: string;            // "https://api.ceos.run/x402/{agentId}"
  a2aEndpoint: string;             // "https://api.ceos.run/a2a/{agentId}"
  serviceDiscovery: string;        // "https://api.ceos.run/services/discover?seller={agentId}"

  // Capabilities (public, non-sensitive)
  skills: string[];                // ["trend-analysis", "content-creation"]

  // Timestamps
  deployedAt: string;              // ISO 8601
}
```

**NOT included:** prompts, responses, persona details, strategy JSON, API keys, wallet data.

### 3C. The Hash & Anchor Pattern (Data Moat Protection)

This is the core innovation. When a service job completes, we:

1. **Hash** the full `AgentDecisionLog` record (SHA-256)
2. **Anchor** only the hash + metadata to ERC-8004

```
┌─────────────────────────────────────────────────────────────┐
│                    HASH & ANCHOR FLOW                        │
│              (Service Job Completion Trigger)                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  On ServiceJob.status === COMPLETED:                         │
│                                                              │
│  ┌─────────────────────────────────┐                        │
│  │ 1. COLLECT                      │                        │
│  │    Fetch AgentDecisionLog(s)    │                        │
│  │    for this jobId               │                        │
│  └──────────────┬──────────────────┘                        │
│                 │                                            │
│                 ▼                                            │
│  ┌─────────────────────────────────┐                        │
│  │ 2. HASH (Data Moat Boundary)   │                        │
│  │                                 │                        │
│  │  payload = canonicalize({       │                        │
│  │    logId,                       │                        │
│  │    jobId,                       │                        │
│  │    agentId,                     │                        │
│  │    prompt,      // ← PRIVATE   │                        │
│  │    response,    // ← PRIVATE   │                        │
│  │    modelUsed,                   │                        │
│  │    tokensUsed,                  │                        │
│  │    executionTimeMs,             │                        │
│  │    isSuccess,                   │                        │
│  │    createdAt                    │                        │
│  │  })                             │                        │
│  │                                 │                        │
│  │  hash = SHA-256(payload)        │                        │
│  └──────────────┬──────────────────┘                        │
│                 │                                            │
│                 ▼                                            │
│  ┌─────────────────────────────────┐                        │
│  │ 3. BUILD METADATA ENVELOPE     │                        │
│  │    (Public-safe only)           │                        │
│  │                                 │                        │
│  │  metadata = {                   │                        │
│  │    type: "service_completion",  │                        │
│  │    jobId,                       │                        │
│  │    capability: "trend-analysis",│                        │
│  │    isSuccess: true,             │                        │
│  │    executionTimeMs: 11832,      │                        │
│  │    modelUsed: "openrouter/...", │                        │
│  │    decisionLogHash: hash,       │                        │
│  │    timestamp: ISO-8601          │                        │
│  │  }                              │                        │
│  └──────────────┬──────────────────┘                        │
│                 │                                            │
│                 ▼                                            │
│  ┌─────────────────────────────────┐                        │
│  │ 4. ANCHOR TO ERC-8004          │                        │
│  │                                 │                        │
│  │  Option A: addValidation()      │                        │
│  │    skillId = capability string  │                        │
│  │    passed = isSuccess           │                        │
│  │    (+ metadata as emitted event)│                        │
│  │                                 │                        │
│  │  Option B: New function         │                        │
│  │    anchorDecisionHash(          │                        │
│  │      tokenId,                   │                        │
│  │      bytes32 hash,              │                        │
│  │      string metadata            │                        │
│  │    )                            │                        │
│  └──────────────┬──────────────────┘                        │
│                 │                                            │
│                 ▼                                            │
│  ┌─────────────────────────────────┐                        │
│  │ 5. UPDATE REPUTATION SCORE     │                        │
│  │                                 │                        │
│  │  newScore = calculateReputation(│                        │
│  │    currentScore,                │                        │
│  │    isSuccess,                   │                        │
│  │    executionTimeMs,             │                        │
│  │    category                     │                        │
│  │  )                              │                        │
│  │                                 │                        │
│  │  trustRegistry.updateReputation(│                        │
│  │    tokenId, newScore)           │                        │
│  │                                 │                        │
│  │  prisma.erc8004Identity.update( │                        │
│  │    reputationScore: newScore)   │                        │
│  └─────────────────────────────────┘                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3D. Reputation Scoring Algorithm

```typescript
function calculateReputation(
  currentScore: number,
  isSuccess: boolean,
  executionTimeMs: number,
  maxLatencyMs: number,
): number {
  // Base change: +10 for success, -15 for failure (asymmetric to punish unreliability)
  const BASE_SUCCESS = 10;
  const BASE_FAILURE = -15;

  let delta = isSuccess ? BASE_SUCCESS : BASE_FAILURE;

  // Latency bonus: if under 50% of max latency, +5 bonus
  if (isSuccess && executionTimeMs < maxLatencyMs * 0.5) {
    delta += 5;
  }

  // Apply with floor at 0 and ceiling at 10000
  return Math.max(0, Math.min(10000, currentScore + delta));
}
```

Score is stored as an integer 0–10000 (basis points), where 10000 = perfect reputation.

### 3E. ERC-8004 Contract Upgrade (Option B — Recommended)

Add a new function to `ERC8004TrustRegistry.sol` specifically for RLAIF hash anchoring:

```solidity
/// @notice Anchor a decision log hash for cryptographic provenance
/// @dev Only metadata + hash go on-chain. Raw RLAIF data stays off-chain.
/// @param tokenId The agent's identity NFT
/// @param decisionHash SHA-256 hash of the canonicalized AgentDecisionLog
/// @param metadata JSON string with public-safe fields only
event DecisionAnchored(
    uint256 indexed tokenId,
    bytes32 decisionHash,
    string metadata
);

function anchorDecision(
    uint256 tokenId,
    bytes32 decisionHash,
    string calldata metadata
) external onlyMinter {
    if (tokenId == 0 || tokenId >= _nextTokenId) revert InvalidTokenId();
    emit DecisionAnchored(tokenId, decisionHash, metadata);
}
```

**Why emit-only (no storage)?** On-chain storage is expensive. The hash is sufficient for provenance proof — anyone can verify by:
1. Requesting the full `AgentDecisionLog` from our API (gated, paid access)
2. Canonicalizing it
3. Computing SHA-256
4. Comparing with the emitted `DecisionAnchored` event

This costs ~30k gas per anchor vs ~100k+ if we stored mappings.

---

## 4. New Files & Changes

### 4A. New Files

| File | Purpose |
|------|---------|
| `apps/agent-runtime/src/services/trinity-deployer.ts` | Unified deploy pipeline orchestrator |
| `apps/agent-runtime/src/services/reputation-anchor.ts` | Hash & Anchor service (RLAIF → ERC-8004) |
| `apps/agent-runtime/src/services/reputation-calculator.ts` | Score calculation logic |
| `apps/web/app/api/agents/deploy/route.ts` | API endpoint to trigger full deploy pipeline |
| `contracts/src/ERC8004TrustRegistryV2.sol` | Contract upgrade with `anchorDecision()` |

### 4B. Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `decisionLogHash String?` to `AgentDecisionLog` |
| `apps/agent-runtime/workers/service-executor.ts` | Call `reputationAnchor.anchorJobCompletion()` after COMPLETED |
| `apps/agent-runtime/src/index.ts` | Initialize BaseChainClient with deployer wallet for on-chain writes |
| `apps/web/lib/env.ts` | Add `DEPLOYER_PRIVATE_KEY`, `NEYNAR_WALLET_ID` to server env schema |

### 4C. New Dependencies

| Package | Purpose |
|---------|---------|
| (none) | All required packages already installed: `viem`, `@coinbase/coinbase-sdk`, Node.js `crypto` |

### 4D. Prisma Schema Addition

```prisma
model AgentDecisionLog {
  // ... existing fields ...

  decisionLogHash String? @map("decision_log_hash")  // SHA-256 of canonicalized record
  anchoredTxHash  String? @map("anchored_tx_hash")    // On-chain tx that anchored this hash
  anchoredAt      DateTime? @map("anchored_at")        // When the hash was anchored
}
```

---

## 5. Implementation Batches

### Batch 1: Reputation Anchor Service (Backend Only, No Contract Change)

**Uses existing `addValidation()` function** — no contract upgrade needed for Phase 1.

1. Create `reputation-anchor.ts` with:
   - `hashDecisionLog(log: AgentDecisionLog): string` — canonical SHA-256
   - `buildMetadataEnvelope(log, job): object` — public-safe fields only
   - `anchorJobCompletion(job, logs): Promise<void>` — full Hash & Anchor flow
2. Create `reputation-calculator.ts` with scoring algorithm
3. Wire into `service-executor.ts` post-COMPLETED hook
4. Add Prisma schema fields (`decisionLogHash`, `anchoredTxHash`, `anchoredAt`)

**Phase 1 writes:** Uses `addValidation(tokenId, capability, isSuccess)` + off-chain metadata log.
**Phase 2 writes:** Uses `anchorDecision(tokenId, hash, metadata)` after contract upgrade.

### Batch 2: Trinity Deployer Pipeline

1. Create `trinity-deployer.ts` orchestrator:
   - `deployAgentIdentity(agentId, name, persona, creatorAddress): Promise<TrinityResult>`
   - Saga pattern: CDP → Farcaster → ERC-8004 → Prisma commit
2. Create `/api/agents/deploy` endpoint that triggers the pipeline
3. Add compensating actions (rollback on failure)

### Batch 3: Contract Upgrade (ERC8004TrustRegistryV2)

1. Add `anchorDecision()` function to contract
2. Add `DecisionAnchored` event
3. Write Foundry test
4. Deploy and update contract addresses

### Batch 4: Dashboard Integration

1. Show reputation score + tier badge on agent cards
2. Show decision log anchor history (tx hashes) on agent detail page
3. Verification UI: paste a decision log → compute hash → check against on-chain event

---

## 6. Security Analysis

### What Goes On-Chain (PUBLIC)

| Data | Risk | Acceptable? |
|------|------|-------------|
| Agent wallet address | Public by design (Base explorer) | ✅ Yes |
| Farcaster FID | Public by design (Farcaster protocol) | ✅ Yes |
| Skill capability string ("trend-analysis") | Public service offering | ✅ Yes |
| Success/failure boolean | Generic outcome | ✅ Yes |
| Execution time (ms) | Performance metric, no IP | ✅ Yes |
| Model name ("openrouter/...") | Public model identifier | ✅ Yes |
| SHA-256 hash of decision log | Cryptographic hash, irreversible | ✅ Yes |

### What Stays Off-Chain (PRIVATE — Data Moat)

| Data | Location | Access Control |
|------|----------|----------------|
| Full prompt (input context) | `AgentDecisionLog.prompt` (Postgres) | API-gated, paid |
| Full response (LLM output) | `AgentDecisionLog.response` (Postgres) | API-gated, paid |
| Agent persona/strategy | `Agent.persona`, `Agent.strategy` (Postgres) | Creator only |
| Encrypted wallet data | `Agent.cdpWalletData` (Postgres) | AES-GCM encrypted |
| Signer UUID | `Agent.signerUuid` (Postgres) | Backend only |

### Attack Vectors Considered

| Attack | Mitigation |
|--------|------------|
| Rainbow table on decision hash | SHA-256 of structured JSON with UUIDs — computationally infeasible |
| Replay anchor transactions | Each anchor includes unique jobId + timestamp — idempotent |
| Front-running reputation updates | `onlyMinter` modifier — only our deployer wallet can call |
| Sybil agents for reputation farming | Deploy fee (0.005 ETH) + CEOS score system already mitigates |

---

## 7. Gas Cost Estimates (Base L2)

| Operation | Estimated Gas | Cost @ 0.01 gwei | Frequency |
|-----------|---------------|-------------------|-----------|
| `addValidation()` (Phase 1) | ~50,000 | ~$0.001 | Per completed job |
| `anchorDecision()` (Phase 2) | ~30,000 | ~$0.0006 | Per completed job |
| `updateReputation()` | ~35,000 | ~$0.0007 | Per completed job |
| `mintIdentity()` | ~150,000 | ~$0.003 | Per agent deploy |

Total per job completion: ~$0.002 on Base L2. At 1000 jobs/day = ~$2/day. Negligible.

---

## 8. Verification Workflow (Third-Party Audit)

```
Institution wants to verify Agent X's decision quality:

1. GET /api/erc8004/reputation/{agentId}
   → Returns: reputationScore, tokenId, history

2. GET /api/agents/{agentId}/decision-logs?jobId={jobId}
   → Returns: Full AgentDecisionLog (paid API, NDA required)

3. Verify locally:
   hash = SHA256(canonicalize(decisionLog))

4. Check on-chain:
   Read DecisionAnchored events for tokenId
   Compare: hash === event.decisionHash

5. If match → PROVEN: This decision log is authentic and unmodified
```

This is the **"trust but verify"** model. Institutions pay for the raw data, but anyone can verify its authenticity against the on-chain hash for free.

---

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Gas costs spike on Base | Low | Batch anchoring (anchor every N jobs or every M minutes) |
| Deployer wallet runs out of ETH | Medium | Monitor balance, auto-alert, fund from protocol treasury |
| Neynar API rate limits during deploy | Medium | Retry with backoff (already implemented in NeynarClient) |
| CDP wallet provisioning failure | Medium | Saga rollback — agent stays in DEPLOYING status, manual retry |
| Contract upgrade breaks existing tokens | Low | V2 contract extends V1, backward compatible |
| Decision log hash collision | Negligible | SHA-256 collision probability is ~2^-128 |

---

## 10. Success Criteria

- [ ] Agent deploy pipeline provisions wallet + Farcaster + ERC-8004 atomically
- [ ] Every completed service job anchors a decision hash on-chain
- [ ] Reputation score updates on every job completion
- [ ] Zero raw RLAIF data appears in any on-chain transaction or event
- [ ] Third-party verification workflow works end-to-end
- [ ] `tsc --noEmit` passes with zero new errors
- [ ] Gas cost per job completion < $0.01 on Base

---

**AWAITING LEAD ARCHITECT APPROVAL**
