# REBORN NFT Gate - Phase 1 GTM Design

**Date:** 2026-02-21
**Status:** Approved
**Branch:** `feat/v1-web3-integration`

## Context

Phase 1 GTM uses "REBORN" branding as a token-gated VIP experience on top of the CEOS protocol. All internal code, contracts, and API routes remain unchanged. Only user-facing UI text shifts to REBORN branding.

## Architecture: Centralized Gate Hook

### `useRebornGate()` — Single Source of Truth

**File:** `apps/web/hooks/use-reborn-gate.ts`

Wraps `useReadContract` to check ERC-721 `balanceOf(userAddress)` on the REBORN NFT contract. Returns `{ isVip, isLoading, nftBalance }`.

Both the Deploy Wizard and Hunt Leads page import this hook.

### Contract Registry

Add `rebornNft` to `CONTRACT_ADDRESSES` in `apps/web/lib/contracts.ts`. Uses `NEXT_PUBLIC_REBORN_NFT_ADDRESS` env var with a mock testnet ERC-721 fallback.

A minimal ERC-721 balance ABI (just `balanceOf`) is added inline since we only need one function.

## UI States

### Access Denied (NFT balance == 0)

- Deploy button: DISABLED
- Execute button: DISABLED
- Warning: "ACCESS DENIED: Phase 1 is exclusive to REBORN NFT holders."
- CTA: "Acquire REBORN Pass" button

### Access Granted (NFT balance > 0)

- Headline: "Web3 Economy REBORNs on ceos.run"
- Perks display:
  - Deployment Fee: $0 (Waived)
  - Server Hosting: 3 Months Free ($0)
  - Initial Agent Treasury (x402 Fuel): 50 USDC
- Deploy/Execute buttons: ENABLED
- Transaction: 50 USDC approve + deposit to AgentPaymaster

## Amount Change

Callers update from `parseUnits('1', 6)` to `parseUnits('50', 6)` for the 50 USDC fuel deposit. The `useExecuteOnBase` hook itself remains unchanged.

## Brand Sweep

- Landing page, headers, deploy wizard copy: visible "ceos.run" -> "REBORN"
- Internal variables, API routes, contract names: NO CHANGES

## Files Modified

1. `apps/web/lib/contracts.ts` — add `rebornNft` address
2. `apps/web/hooks/use-reborn-gate.ts` — NEW: centralized gate hook
3. `apps/web/components/deploy/deploy-wizard.tsx` — VIP gate + perks + branding
4. `apps/web/app/(app)/dashboard/hunt-leads/page.tsx` — VIP gate + 50 USDC amount
5. Landing page components — brand text sweep
