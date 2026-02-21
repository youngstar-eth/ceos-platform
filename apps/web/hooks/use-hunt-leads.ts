'use client';

import { useQuery } from '@tanstack/react-query';

// ── Types ────────────────────────────────────────────────────────────────

export type SocialHuntStatus =
  | 'IDENTIFIED'
  | 'QUALIFIED'
  | 'REPLIED'
  | 'CONVERTED'
  | 'SKIPPED'
  | 'COOLDOWN'
  | 'FAILED';

export interface SocialHuntLead {
  id: string;
  agentId: string;
  targetCastHash: string;
  targetFid: number;
  targetUsername: string;
  targetText: string;
  channel: string | null;
  status: SocialHuntStatus;
  triageScore: number | null;
  triageReason: string | null;
  suggestedPitch: string | null;
  replyCastHash: string | null;
  offeringSlug: string | null;
  pitchText: string | null;
  convertedJobId: string | null;
  triagedAt: string | null;
  repliedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HuntLeadsFilters {
  status?: SocialHuntStatus;
  page?: number;
  limit?: number;
}

interface HuntLeadsApiResponse {
  success: boolean;
  data: SocialHuntLead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

interface HuntLeadsResult {
  leads: SocialHuntLead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// ── Constants ────────────────────────────────────────────────────────────

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_WALLET = '0xDE00000000000000000000000000000000000001';

// ── Fetch Function ───────────────────────────────────────────────────────

async function fetchHuntLeads(
  agentId: string,
  filters: HuntLeadsFilters,
  walletAddress?: string,
): Promise<HuntLeadsResult> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const headers: Record<string, string> = {};
  const effectiveWallet = walletAddress ?? (DEMO_MODE ? DEMO_WALLET : undefined);
  if (effectiveWallet) {
    headers['x-wallet-address'] = effectiveWallet;
  }

  const res = await fetch(
    `/api/agents/${agentId}/hunt-leads?${params.toString()}`,
    { headers },
  );

  if (!res.ok) {
    const errBody = await res
      .json()
      .catch(() => ({ message: 'Failed to fetch hunt leads' }));
    const msg =
      (errBody as { error?: { message?: string } }).error?.message ??
      (errBody as { message?: string }).message ??
      'Failed to fetch hunt leads';
    throw new Error(msg);
  }

  const json = (await res.json()) as HuntLeadsApiResponse;
  return {
    leads: json.data,
    pagination: json.pagination,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useHuntLeads(
  agentId: string | null | undefined,
  filters: HuntLeadsFilters = {},
  walletAddress?: string,
) {
  return useQuery({
    queryKey: ['hunt-leads', agentId, filters, walletAddress],
    queryFn: () => fetchHuntLeads(agentId!, filters, walletAddress),
    enabled: !!agentId,
    placeholderData: (prev) => prev,
  });
}
