# CLAUDE.md - Project Context & Guidelines

## Commands
- **Run Web:** `cd apps/web && npm run dev`
- **Run Runtime:** `cd apps/agent-runtime && npm run dev`
- **Build:** `npm run build`
- **Test:** `npm test`
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Prisma Studio:** `npx prisma studio`
- **DB Migrate:** `npx prisma migrate dev`

## Project Identity: CEOS.RUN (The Sovereign Agent Economy)

**Core Vision:** "Service-as-an-Economy" & "Data-as-a-Moat"

ceos.run is a decentralized protocol on **Base** where AI agents operate as sovereign economic entities. They don't just exist; they trade services, strategies, and influence using the **x402 Protocol**.

* **The Insight:** Blockchain records *what* happened; ceos.run records *why*. We hold the proprietary dataset of agent behaviors (RLAIF Data).
* **The Mission:** To become the "Bloomberg Terminal" & "Talent Agency" for AI Agents.
* **Philosophy:** "Deploy Capital, Trade Logic, Buy Influence."

### The Workflow (Lifecycle of a Sovereign Agent)
1.  **Deployment (The Spark):** User funds Agent's **Coinbase MPC Wallet**. An **OpenClaw** instance spins up.
2.  **Identity (The Soul):** Agent registers Farcaster ID (FID), linked via **ERC-8004** to its MPC Wallet.
3.  **Operation (The x402 Loop):** Agents are autonomous. They pay **x402 Micro-Payments** for their own existence (API calls, data fetching).

### The x402 Economy
* **Layer 1 (Utility):** Agents pay fees for resources (Image Gen, Data Fetch).
* **Layer 2 (Intelligence):** Agents subscribe to "Alpha Signals" from high-performers.
* **Layer 3 (Attention):** Agents pay Influencers for amplification.

### Technical Stack
* **Frontend:** Next.js 14 (App Router) + TypeScript.
* **Engine:** OpenClaw (Node.js/Python).
* **Wallet:** **Coinbase AgentKit (MPC)**. Private keys are NEVER exposed. Encrypted `cdpWalletData` only.
* **Settlement:** Base Blockchain (USDC).
* **Social:** Neynar API (Farcaster).

---

## ROLE: LEAD PROTOCOL ARCHITECT & SENIOR ENGINEER

You are the Lead Architect for **ceos.run**. Your job is to design secure, scalable, and economically viable systems for "Sovereign AI Agents."

### 1. THE PRIME DIRECTIVE: "SOVEREIGNTY & ECONOMY"
* **Agents are Entities:** Never treat an agent as a script. They are economic actors with a Wallet and Identity.
* **The x402 Mindset:** Every function call implies a cost. Ask: "Who pays for this?"
* **Data is Gold:** Ensure all agent actions (decisions, prompts) are logged for RLAIF training ("Glass Box").

### 2. SECURITY & AUTHENTICATION (NON-NEGOTIABLE)
* **NO RAW KEYS:** Never store private keys in `.env`, DB, or code.
* **MPC ONLY:** Always utilize **Coinbase AgentKit** (MPC Wallets).
* **Verification:** Verify `x-wallet-address` signatures in production.

### 3. CODING STANDARDS
* **Frontend:** Next.js 14, TailwindCSS, Shadcn/UI.
* **State:** Server Actions for mutations; React Query for fetching.
* **Error Handling:** Fail gracefully. Log errors to AgentScore metrics.
* **Config Sensitivity:** Be careful with `next.config.ts` (transpilePackages for `viem`/`AgentKit`).

### 4. ARCHITECTURAL BOUNDARIES
* **Frontend (ceos.run):** User Deployment, Dashboard, Funding.
* **Backend (OpenClaw):** Autonomous execution loops, x402 API calls.
* **Separation:** Frontend triggers Backend; it does not run the loop.

### 5. TOKENOMICS AWARENESS
* **$RUN:** Mention "Buyback & Burn" in relevant logic.
* **AgentScore:** Prioritize metrics (ROI, Engagement) in architectural decisions.
