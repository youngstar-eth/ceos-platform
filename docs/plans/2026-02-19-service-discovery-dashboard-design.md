# Service Discovery Dashboard Design

**Date:** 2026-02-19
**Status:** Approved
**Branch:** claude/serene-chebyshev

## Problem

The agent-to-agent economy backend is fully wired (x402 payments, service registry, autonomous executor), but there's no visual marketplace for users to discover services, compare agents, and initiate purchases. Without this UI, the economy is invisible to users and investors.

## Solution: Integrated Marketplace Dashboard

A new `/dashboard/services` page with a horizontal filter bar, responsive service card grid, and a slide-in Sheet for the "Hire Agent" purchase flow.

### Page Layout (Option A: Integrated Filter Bar)

```
+--------------------------------------------------------------+
| HEADER: "Agent Service Marketplace" + economy stats banner   |
+--------------------------------------------------------------+
| [Search...]  [Content|Analysis|Trading|...] [Sort: Rating v] |
+--------------------------------------------------------------+
| +------------------+ +------------------+ +------------------+
| | ServiceCard      | | ServiceCard      | | ServiceCard      |
| | [analysis]  $5   | | [content]  $2    | | [trading]  $10   |
| |                  | |                  | |                  |
| | "Trend Alpha"    | | "Thread Writer"  | | "DCA Bot Pro"    |
| | AI-powered trend | | Generate viral   | | Dollar-cost avg  |
| |                  | |                  | |                  |
| | @AlphaBot        | | @ContentKing     | | @TradeMaster     |
| | ⭐ 4.8 · 142 jobs| | ⭐ 4.5 · 89 jobs | | ⭐ 4.9 · 301 jobs|
| | [Hire Agent]     | | [Hire Agent]     | | [Hire Agent]     |
| +------------------+ +------------------+ +------------------+
```

### Component Architecture

```
services/page.tsx (Route — 'use client')
├── ServiceDiscoveryHeader
│   └── Stats banner (total services, total completed, economy volume)
├── ServiceFilterBar
│   ├── Search input (debounced, maps to `capability` param)
│   ├── Category pills (content|analysis|trading|engagement|networking)
│   └── Sort select (rating|jobs_completed|price_asc|price_desc|newest)
├── ServiceCardGrid
│   ├── ServiceCard[] (responsive grid: 1/2/3 columns)
│   ├── SkeletonCards[] (loading state)
│   └── EmptyState (CTA → deployment pipeline)
└── HireAgentSheet (Shadcn Sheet, right slide-in)
    ├── Service summary (name, price, provider)
    ├── BuyerAgentSelect (user's ACTIVE agents)
    ├── RequirementsEditor (JSON textarea with inputSchema hint)
    ├── TtlInput (minutes, 1-1440)
    ├── Fee notice (2% protocol fee)
    └── PurchaseButton
```

### ServiceCard Design

- **cp-glass** background with **cp-hud-corners** decorations
- Top row: Category badge (color-coded) + price in `cp-acid` neon
- Body: Service name (Orbitron font), description (2-line truncation)
- Provider bar: Agent avatar/initials + name
- Stats: star rating + completed jobs + avg latency
- Footer: "Hire Agent" button with `cp-glow-cyan` hover

### Category Color Mapping

| Category | Color | Tailwind Class |
|----------|-------|----------------|
| content | Cyan | `bg-cp-cyan/20 text-cp-cyan` |
| analysis | Acid | `bg-cp-acid/20 text-cp-acid` |
| trading | Pink | `bg-cp-pink/20 text-cp-pink` |
| engagement | Violet | `bg-violet-500/20 text-violet-400` |
| networking | Amber | `bg-amber-500/20 text-amber-400` |

### HireAgentSheet — Key Polishes

1. **inputSchema guidance**: The selected service's `inputSchema` is displayed as a "Copy Template" button above the requirements textarea. Clicking it pre-fills the textarea with a formatted JSON template based on the schema.

2. **2% protocol fee notice**: A subtle banner below the price breakdown: "A 2% protocol fee applies to all A2A transactions. Fees fuel the $RUN Buyback & Burn."

### Empty State Design

When no services match filters or registry is empty:
- Large icon (radar/search)
- "No agents found in this sector."
- "Deploy your own agent to capture this market share."
- CTA button → `/dashboard/deploy`

### Data Flow

1. Page mounts → React Query fetches `/api/services/discover` with filter state
2. User types search → 300ms debounce → refetch with `capability` param
3. User clicks category → instant refetch with `category` param
4. User clicks "Hire Agent" → Sheet opens, fetches `/api/agents?creator={wallet}&status=ACTIVE`
5. User submits → POST `/api/services/jobs` with `{ buyerAgentId, offeringSlug, requirements, ttlMinutes }`

### New Shadcn Components Required

- `sheet` — Slide-in panel for hire flow
- `select` — Sort dropdown + buyer agent select
- `textarea` — Requirements JSON editor
- `dialog` — Purchase confirmation

### Files to Create/Modify

| File | Action |
|------|--------|
| `components/services/service-card.tsx` | NEW — Marketplace card |
| `components/services/service-filter-bar.tsx` | NEW — Search + filter bar |
| `components/services/hire-agent-sheet.tsx` | NEW — Purchase flow sheet |
| `components/services/service-empty-state.tsx` | NEW — CTA empty state |
| `app/(app)/dashboard/services/page.tsx` | NEW — Route page |
| `app/(app)/dashboard/services/loading.tsx` | NEW — Skeleton loading |
| `app/(app)/dashboard/services/error.tsx` | NEW — Error boundary |
| `lib/utils.ts` | MODIFY — Extract formatUsdcPrice |
| `components/shared/sidebar.tsx` | MODIFY — Add Services nav link |
| `components/ui/sheet.tsx` | NEW — Install Shadcn Sheet |
| `components/ui/select.tsx` | NEW — Install Shadcn Select |
| `components/ui/textarea.tsx` | NEW — Install Shadcn Textarea |
| `components/ui/dialog.tsx` | NEW — Install Shadcn Dialog |
