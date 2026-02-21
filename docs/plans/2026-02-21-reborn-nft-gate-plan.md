# REBORN NFT Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ERC-721 NFT-gated VIP access to the Deploy Wizard and Hunt Leads pages, with REBORN branding sweep across the frontend.

**Architecture:** Centralized `useRebornGate()` hook checks NFT `balanceOf` via Wagmi `useReadContract`. Both gated pages import this hook and conditionally render VIP/non-VIP states. All internal code/contracts unchanged.

**Tech Stack:** Wagmi v2, viem, Next.js 14, TailwindCSS, Shadcn/UI

---

### Task 1: Create Branch + Register Contract Address

**Files:**
- Modify: `apps/web/lib/contracts.ts`

**Step 1: Create the feature branch**

```bash
cd /Users/inancayvaz/Desktop/ceos-platform-main
git checkout -b feat/v1-web3-integration
```

**Step 2: Add `rebornNft` to CONTRACT_ADDRESSES**

In `apps/web/lib/contracts.ts`, add after the `ceosAgentIdentity` line:

```typescript
// REBORN Phase 1 NFT Gate (ERC-721)
rebornNft: (process.env.NEXT_PUBLIC_REBORN_NFT_ADDRESS?.trim() ?? '0x03B4fCBb8Fe0753af22efEaAe8F5E0e7B04CdA46') as Address,
```

The fallback `0x03B4...` is a mock Base Sepolia ERC-721 address for dev/testing.

**Step 3: Add minimal ERC-721 balance ABI**

After the `ERC20_ABI` export, add:

```typescript
// Minimal ERC-721 ABI — only balanceOf for token-gate checks
export const ERC721_BALANCE_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
```

**Step 4: Commit**

```bash
git add apps/web/lib/contracts.ts
git commit -m "feat: add REBORN NFT contract address + ERC721 balance ABI"
```

---

### Task 2: Create `useRebornGate()` Hook

**Files:**
- Create: `apps/web/hooks/use-reborn-gate.ts`

**Step 1: Write the hook**

```typescript
'use client';

import { useReadContract, useAccount } from 'wagmi';
import { CONTRACT_ADDRESSES, ERC721_BALANCE_ABI } from '@/lib/contracts';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/**
 * Centralized REBORN NFT gate.
 * Checks ERC-721 balanceOf(connectedWallet) on the REBORN NFT contract.
 *
 * Returns:
 * - isVip: true if balance > 0 (or DEMO_MODE is on)
 * - isLoading: true while the RPC call is in-flight
 * - nftBalance: raw bigint balance from the contract
 */
export function useRebornGate() {
  const { address } = useAccount();

  const { data: balance, isLoading, error } = useReadContract({
    address: CONTRACT_ADDRESSES.rebornNft,
    abi: ERC721_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !DEMO_MODE },
  });

  // In DEMO_MODE, always grant VIP access
  if (DEMO_MODE) {
    return { isVip: true, isLoading: false, nftBalance: 1n, error: null };
  }

  const nftBalance = balance ?? 0n;
  const isVip = nftBalance > 0n;

  return { isVip, isLoading, nftBalance, error: error?.message ?? null };
}
```

**Step 2: Commit**

```bash
git add apps/web/hooks/use-reborn-gate.ts
git commit -m "feat: useRebornGate() centralized NFT gate hook"
```

---

### Task 3: Wire REBORN Gate into Deploy Wizard

**Files:**
- Modify: `apps/web/components/deploy/deploy-wizard.tsx`

**Step 1: Add imports**

At the top of `deploy-wizard.tsx`, add:

```typescript
import { useRebornGate } from '@/hooks/use-reborn-gate';
import { Shield, Lock, ExternalLink } from 'lucide-react';
```

**Step 2: Add hook call inside DeployWizard component**

After `const { address } = useAccount();`, add:

```typescript
const { isVip, isLoading: isGateLoading } = useRebornGate();
```

**Step 3: Add VIP Perks Banner**

Before the step content (before `{step < 3 ? (`), add a perks/denied section:

```tsx
{/* REBORN VIP Gate */}
{step === 3 && !isGateLoading && (
  isVip ? (
    <div className="rounded-lg border border-exec-gold/30 bg-exec-gold/5 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-exec-gold" />
        <h3 className="text-lg font-bold text-exec-gold font-heading tracking-wider">
          REBORN VIP ACCESS GRANTED
        </h3>
      </div>
      <p className="text-sm text-gray-400">
        Web3 Economy REBORNs on ceos.run
      </p>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="border border-white/10 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-mono">DEPLOYMENT FEE</p>
          <p className="text-lg font-bold text-green-400">$0</p>
          <p className="text-[10px] text-gray-600">Waived for VIPs</p>
        </div>
        <div className="border border-white/10 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-mono">SERVER HOSTING</p>
          <p className="text-lg font-bold text-green-400">$0</p>
          <p className="text-[10px] text-gray-600">3 Months Free</p>
        </div>
        <div className="border border-exec-gold/30 rounded-lg p-3 bg-exec-gold/5">
          <p className="text-xs text-gray-500 font-mono">x402 FUEL</p>
          <p className="text-lg font-bold text-exec-gold">50 USDC</p>
          <p className="text-[10px] text-gray-600">Agent Treasury</p>
        </div>
      </div>
    </div>
  ) : (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 space-y-4 text-center">
      <Lock className="h-8 w-8 text-red-400 mx-auto" />
      <h3 className="text-lg font-bold text-red-400 font-mono tracking-wider">
        ACCESS DENIED
      </h3>
      <p className="text-sm text-gray-400">
        Phase 1 is exclusive to REBORN NFT holders.
      </p>
      <a
        href="https://opensea.io"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-lg font-mono text-sm tracking-wider transition-colors"
      >
        Acquire REBORN Pass
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  )
)}
```

**Step 4: Disable deploy button for non-VIPs**

In the deploy button at the bottom, update the `disabled` prop:

```tsx
disabled={isDeploying || isConfirmed || isFullyComplete || syncStatus === 'syncing' || !address || (!isVip && !DEMO_MODE)}
```

**Step 5: Update deploy button label for VIPs**

In the `getButtonLabel()` function, change the default return:

```typescript
if (DEMO_MODE) return 'Deploy Agent (Demo)';
return isVip ? 'Deploy Agent — 50 USDC Fuel' : 'REBORN Pass Required';
```

(replaces the old `return 'Deploy Agent (0.005 ETH)';`)

**Step 6: Commit**

```bash
git add apps/web/components/deploy/deploy-wizard.tsx
git commit -m "feat: REBORN VIP gate in deploy wizard with perks display"
```

---

### Task 4: Wire REBORN Gate into Hunt Leads Page

**Files:**
- Modify: `apps/web/app/(app)/dashboard/hunt-leads/page.tsx`

**Step 1: Add imports**

Add at the top:

```typescript
import { useRebornGate } from '@/hooks/use-reborn-gate';
import { Lock, ExternalLink, Shield } from 'lucide-react';
```

**Step 2: Add hook call inside HuntLeadsPage**

After the `useExecuteOnBase()` call, add:

```typescript
const { isVip, isLoading: isGateLoading } = useRebornGate();
```

**Step 3: Add Access Denied banner**

After the high-score notice section (after the `</div>` that closes it), add:

```tsx
{/* REBORN VIP Gate Banner */}
{!isGateLoading && !isVip && (
  <div className="flex items-center gap-3 border border-red-500/20 bg-red-500/5 rounded-sm px-4 py-3">
    <Lock className="h-4 w-4 text-red-400 flex-shrink-0" />
    <p className="font-mono text-xs text-white/50 flex-1">
      <span className="text-red-400 font-bold">ACCESS DENIED:</span>{' '}
      Phase 1 is exclusive to REBORN NFT holders.
    </p>
    <a
      href="https://opensea.io"
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[10px] text-exec-gold hover:text-white underline tracking-wider flex-shrink-0 flex items-center gap-1"
    >
      ACQUIRE PASS <ExternalLink className="h-3 w-3" />
    </a>
  </div>
)}
```

**Step 4: Update handleExecute amount to 50 USDC**

In the `handleExecute` callback, change:

```typescript
const amount = parseUnits('50', 6);
```

(was `parseUnits('1', 6)`)

**Step 5: Disable Execute button for non-VIPs**

In the `LeadCard` component's Execute button, update disabled:

```tsx
disabled={isExecuting || !isVip}
```

To accomplish this, pass `isVip` as a prop to LeadCard. Update the function signature:

```typescript
function LeadCard({
  lead, onExecute, isExecuting, executeStatus, isVip,
}: {
  lead: SocialHuntLead;
  onExecute: (lead: SocialHuntLead) => void;
  isExecuting: boolean;
  executeStatus: ExecuteStatus;
  isVip: boolean;
}) {
```

And update the button:

```tsx
<Button disabled={isExecuting || !isVip} ...>
```

Update the LeadCard usage in the grid:

```tsx
<LeadCard
  key={lead.id}
  lead={lead}
  onExecute={handleExecute}
  isExecuting={executingLeadId === lead.id}
  executeStatus={executingLeadId === lead.id ? executeStatus : 'idle'}
  isVip={isVip}
/>
```

**Step 6: Commit**

```bash
git add apps/web/app/(app)/dashboard/hunt-leads/page.tsx
git commit -m "feat: REBORN VIP gate in hunt leads + 50 USDC deposit"
```

---

### Task 5: Brand Sweep — Landing Page

**Files:**
- Modify: `apps/web/components/landing/scene-hero.tsx` (lines 25-27)
- Modify: `apps/web/components/landing/hero-runner.tsx` (line 36)
- Modify: `apps/web/components/landing/landing-hero.tsx` (line 19)
- Modify: `apps/web/app/(marketing)/page.tsx` (line 36)
- Modify: `apps/web/app/layout.tsx` (metadata strings)

**Step 1: scene-hero.tsx**

Change the hero title from `CEO$.RUN` to `REBORN`:

```tsx
{/* OLD: */}
<span className="text-white">CEO</span>
<span className="text-exec-gold">$</span>
<span className="text-white">.RUN</span>

{/* NEW: */}
<span className="text-white">RE</span>
<span className="text-exec-gold">BORN</span>
```

Change the subtitle from "Deploy. Earn. Repeat." to "Deploy. Evolve. Transcend."

**Step 2: hero-runner.tsx (line 36)**

Change `CEOS RUN.` to `REBORN.`

**Step 3: landing-hero.tsx (line 19)**

Change `ACTIVE CEOS` to `ACTIVE AGENTS`

**Step 4: (marketing)/page.tsx (line 36)**

Change `READY TO RUN?` to `READY TO BE REBORN?`

**Step 5: layout.tsx metadata**

Update user-visible strings:
- `'ceos.run — Autonomous AI Agents on Farcaster'` -> `'REBORN — Autonomous AI Agents on Base'`
- Keep `metadataBase: new URL('https://ceos.run')` (this is the domain, not branding)
- Keep `siteName: 'ceos.run'` (technical SEO reference)

**Step 6: Commit**

```bash
git add apps/web/components/landing/ apps/web/app/layout.tsx apps/web/app/\(marketing\)/page.tsx
git commit -m "feat: REBORN brand sweep across landing page and metadata"
```

---

### Task 6: Verify + Final Commit

**Step 1: TypeScript check**

```bash
cd /Users/inancayvaz/Desktop/ceos-platform-main/apps/web && npx tsc --noEmit
```

Expected: Zero new errors (only pre-existing `farcasterUsername` errors).

**Step 2: Dev server test**

```bash
cd /Users/inancayvaz/Desktop/ceos-platform-main/apps/web && npm run dev
```

Open `http://localhost:3000`:
- Landing page shows "REBORN" branding
- `/dashboard/deploy` shows VIP gate (denied in demo mode shows VIP since DEMO_MODE=true)
- `/dashboard/hunt-leads` shows gate banner

**Step 3: Push branch**

```bash
git push -u origin feat/v1-web3-integration
```
